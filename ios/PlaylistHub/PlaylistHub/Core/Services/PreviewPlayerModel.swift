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
    @Published private(set) var previewProgress: Double = 0

    let player = AVPlayer()
    private var statusObserver: AnyCancellable?
    private var didStart = false
    private var previewStartTime: CMTime = .zero
    private var timeObserverToken: Any?
    private var startTask: Task<Void, Never>?

    /// Duration of the preview clip in seconds
    private static let clipDuration: Double = 30
    /// Timeout to wait for playback start
    private static let loadTimeout: TimeInterval = 2.5
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
            let didPlay = await self.tryURLsFast(urls)
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

    /// Fast URL probing: skip asset pre-validation, play directly, seek after first frame
    private func tryURLsFast(_ urls: [URL]) async -> Bool {
        for url in urls {
            guard !Task.isCancelled else { return false }

            let asset = AVURLAsset(url: url, options: [
                "AVURLAssetHTTPHeaderFieldsKey": [
                    "User-Agent": "VLC/3.0.21 LibVLC/3.0.21"
                ]
            ])

            let playerItem = AVPlayerItem(asset: asset)
            playerItem.preferredForwardBufferDuration = 1

            player.automaticallyWaitsToMinimizeStalling = false
            player.replaceCurrentItem(with: playerItem)
            player.isMuted = true
            previewStartTime = .zero
            player.play()

            let ready = await waitForPlayback(timeout: Self.loadTimeout)
            if ready {
                // Seek to interesting point AFTER first frame is visible
                Task { [weak self] in await self?.seekToInterestingPoint() }
                setupClipLoop()
                return true
            } else {
                player.pause()
                player.replaceCurrentItem(with: nil)
            }
        }
        return false
    }

    /// Seek to an interesting point after playback has started (non-blocking)
    private func seekToInterestingPoint() async {
        for _ in 0..<10 {
            guard !Task.isCancelled else { return }
            guard let item = player.currentItem else { return }
            let dur = item.duration
            if dur.isValid && !dur.isIndefinite {
                let totalSeconds = CMTimeGetSeconds(dur)
                if totalSeconds > 60 {
                    let seekTime = CMTime(seconds: totalSeconds * Self.seekFraction, preferredTimescale: 600)
                    await player.seek(to: seekTime, toleranceBefore: .zero, toleranceAfter: CMTime(seconds: 2, preferredTimescale: 600))
                    previewStartTime = seekTime
                }
                return
            }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
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

    /// Loop the preview and track progress for the red bar
    private func setupClipLoop() {
        if let token = timeObserverToken {
            player.removeTimeObserver(token)
            timeObserverToken = nil
        }

        timeObserverToken = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.1, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            let current = CMTimeGetSeconds(time)
            let startSeconds = CMTimeGetSeconds(self.previewStartTime)
            let clipEnd = startSeconds + Self.clipDuration

            // Update progress for red bar
            let elapsed = current - startSeconds
            self.previewProgress = min(max(elapsed / Self.clipDuration, 0), 1)

            // Loop back when clip ends or near file end
            let item = self.player.currentItem
            let dur = item?.duration ?? .indefinite
            let fileDuration = dur.isValid && !dur.isIndefinite ? CMTimeGetSeconds(dur) : Double.greatestFiniteMagnitude

            if current >= clipEnd || current >= fileDuration - 0.5 {
                self.previewProgress = 0
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
        previewProgress = 0
        state = .idle
        hasPreviewSource = false
        didStart = false
    }
}
