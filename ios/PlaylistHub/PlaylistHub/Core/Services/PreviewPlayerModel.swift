import AVFoundation
import AVKit
import Combine
import SwiftUI

// MARK: - Preview Player Model
//
// Drives a real autoplay preview-first hero experience.
//
// Behavior:
// 1) Resolve preview-capable media URLs (movies: VOD stream, series: episode streams)
// 2) Play a muted 30-second snippet from an interesting point in the media
// 3) Expose explicit loading/ready/unavailable states for the UI
// 4) Only fall back to artwork when no preview-capable media succeeds

@MainActor
final class PreviewPlayerModel: ObservableObject {
    enum State: Equatable {
        case idle
        case loading
        case ready
        case unavailable
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var hasPreviewSource = false
    @Published var isReady = false
    @Published var isMuted = true

    let player = AVPlayer()
    private var statusObserver: AnyCancellable?
    private var didStart = false
    private var previewStartTime: CMTime = .zero
    private var timeObserverToken: Any?
    private var startTask: Task<Void, Never>?

    /// Duration of the preview clip in seconds
    private static let clipDuration: Double = 30
    /// Timeout to wait for playback start
    private static let loadTimeout: TimeInterval = 4
    /// Seek target as fraction of total duration (skip logos/intros)
    private static let seekFraction: Double = 0.10

    func startPreview(for item: PlaylistItem) {
        guard !didStart else { return }
        didStart = true

        state = .loading
        isReady = false
        // Keep hero in "preview-first" loading state for movie/series until proven unavailable.
        hasPreviewSource = (item.contentType == .movie || item.contentType == .series)

        startTask?.cancel()
        startTask = Task { [weak self] in
            guard let self else { return }
            let urls = await self.resolvePreviewURLs(for: item)
            guard !Task.isCancelled else { return }

            if urls.isEmpty {
                self.hasPreviewSource = false
                self.state = .unavailable
                return
            }

            self.hasPreviewSource = true
            let didPlay = await self.tryURLs(urls)
            guard !Task.isCancelled else { return }

            if didPlay {
                withAnimation(.easeIn(duration: 0.4)) {
                    self.state = .ready
                    self.isReady = true
                }
            } else {
                self.state = .unavailable
                self.isReady = false
            }
        }
    }

    private func resolvePreviewURLs(for item: PlaylistItem) async -> [URL] {
        var ordered: [URL] = []
        var seen = Set<String>()

        func appendURL(_ url: URL) {
            let key = url.absoluteString
            guard !seen.contains(key) else { return }
            seen.insert(key)
            ordered.append(url)
        }

        func appendCascade(streamURL: String, hlsFallback: String?) {
            for url in AppConfig.vodStreamCascade(for: streamURL, hlsFallback: hlsFallback) {
                appendURL(url)
            }
        }

        // Movies: preview from the actual VOD stream.
        if item.contentType == .movie {
            appendCascade(streamURL: item.resolvedStreamURL, hlsFallback: item.hlsFallbackURL)
            return ordered
        }

        // Series: preview should come from real episode media when possible.
        if item.contentType == .series {
            do {
                let episodes = try await DataService.shared.fetchSeriesEpisodes(streamUrl: item.streamUrl)
                let sorted = episodes.seasons
                    .sorted { $0.season < $1.season }
                    .flatMap { season in
                        season.episodes.sorted { $0.episode < $1.episode }
                    }

                for episode in sorted.prefix(3) {
                    let ext = episode.streamUrl.components(separatedBy: ".").last ?? ""
                    let hlsFallback = ext != "m3u8"
                        ? episode.streamUrl.replacingOccurrences(
                            of: "\\.[a-zA-Z0-9]+$",
                            with: ".m3u8",
                            options: .regularExpression
                        )
                        : nil
                    appendCascade(streamURL: episode.streamUrl, hlsFallback: hlsFallback)
                }
            } catch {
                // Fallback to base series stream if episodes cannot be resolved.
                appendCascade(streamURL: item.resolvedStreamURL, hlsFallback: item.hlsFallbackURL)
            }
            return ordered
        }

        // Fallback for other content types
        appendCascade(streamURL: item.resolvedStreamURL, hlsFallback: item.hlsFallbackURL)
        return ordered
    }

    private func tryURLs(_ urls: [URL]) async -> Bool {
        for url in urls {
            guard !Task.isCancelled else { return false }

            let asset = AVURLAsset(url: url, options: [
                "AVURLAssetHTTPHeaderFieldsKey": [
                    "User-Agent": "VLC/3.0.21 LibVLC/3.0.21"
                ]
            ])

            do {
                let playable = try await asset.load(.isPlayable)
                guard playable else { continue }

                // Load duration to calculate seek point
                let duration = try await asset.load(.duration)
                let totalSeconds = CMTimeGetSeconds(duration)

                let playerItem = AVPlayerItem(asset: asset)
                // Minimal buffer for fast start
                playerItem.preferredForwardBufferDuration = 3

                player.replaceCurrentItem(with: playerItem)
                player.isMuted = true

                // Seek to an interesting point (10% in) if duration is known
                if totalSeconds > 60 {
                    let seekSeconds = totalSeconds * Self.seekFraction
                    let seekTime = CMTime(seconds: seekSeconds, preferredTimescale: 600)
                    await player.seek(to: seekTime, toleranceBefore: .zero, toleranceAfter: CMTime(seconds: 2, preferredTimescale: 600))
                    previewStartTime = seekTime
                } else {
                    previewStartTime = .zero
                }

                player.play()

                let ready = await waitForPlayback(timeout: Self.loadTimeout)
                if ready {
                    setupClipLoop()
                    return true
                } else {
                    player.pause()
                    player.replaceCurrentItem(with: nil)
                }
            } catch {
                continue
            }
        }
        // All URLs failed — artwork fallback remains
        return false
    }

    private func waitForPlayback(timeout: TimeInterval) async -> Bool {
        await withCheckedContinuation { continuation in
            var resolved = false

            let timer = DispatchSource.makeTimerSource(queue: .main)
            timer.schedule(deadline: .now() + timeout)
            timer.setEventHandler {
                guard !resolved else { return }
                resolved = true
                timer.cancel()
                continuation.resume(returning: false)
            }
            timer.resume()

            statusObserver = player.publisher(for: \.timeControlStatus)
                .filter { $0 == .playing }
                .first()
                .receive(on: DispatchQueue.main)
                .sink { [weak self] _ in
                    guard !resolved else { return }
                    resolved = true
                    timer.cancel()
                    self?.statusObserver = nil
                    continuation.resume(returning: true)
                }
        }
    }

    /// Loop the preview: play for clipDuration seconds, then seek back to start point
    private func setupClipLoop() {
        if let token = timeObserverToken {
            player.removeTimeObserver(token)
            timeObserverToken = nil
        }

        let startSeconds = CMTimeGetSeconds(previewStartTime)
        let clipEnd = startSeconds + Self.clipDuration

        // Periodic time observer — check every 0.5s
        timeObserverToken = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            let current = CMTimeGetSeconds(time)

            // If past clip end OR near file end → loop back
            let item = self.player.currentItem
            let dur = item?.duration ?? .indefinite
            let fileDuration = dur.isValid && !dur.isIndefinite ? CMTimeGetSeconds(dur) : Double.greatestFiniteMagnitude

            if current >= clipEnd || current >= fileDuration - 0.5 {
                self.player.seek(to: self.previewStartTime, toleranceBefore: .zero, toleranceAfter: CMTime(seconds: 1, preferredTimescale: 600))
                self.player.play()
            }
        }
    }

    func toggleMute() {
        isMuted.toggle()
        player.isMuted = isMuted
    }

    func stop() {
        startTask?.cancel()
        startTask = nil
        player.pause()
        if let token = timeObserverToken {
            player.removeTimeObserver(token)
            timeObserverToken = nil
        }
        player.replaceCurrentItem(with: nil)
        statusObserver = nil
        isReady = false
        state = .idle
        hasPreviewSource = false
        didStart = false
    }
}
