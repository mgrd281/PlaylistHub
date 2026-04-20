import AVFoundation
import AVKit
import Combine
import SwiftUI

// MARK: - Preview Player Model
//
// Drives a real autoplay preview-first hero experience.
//
// Behavior:
// 1) Prefer trailer / teaser / preview URLs from metadata when available
// 2) Resolve preview-capable media URLs (movies: VOD stream, series: episode streams)
// 3) Play a muted 30-second snippet from a strong cinematic scene
// 4) Expose explicit loading/ready/unavailable states for the UI
// 5) Only fall back to artwork when no preview-capable media succeeds

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
    /// True only when the player is actively rendering frames (timeControlStatus == .playing)
    @Published private(set) var isActuallyPlaying = false

    let player = AVPlayer()
    private var statusObserver: AnyCancellable?
    private var playbackStatusObserver: AnyCancellable?
    private var didStart = false
    private var previewStartTime: CMTime = .zero
    private var timeObserverToken: Any?
    private var startTask: Task<Void, Never>?
    /// Whether the current source is a trailer/teaser (no internal seek needed)
    private var isTrailerSource = false
    /// Content type of the current preview item
    private var currentContentType: ContentType = .movie

    /// Duration of the preview clip in seconds
    private static let clipDuration: Double = 45
    /// Timeout to wait for playback start — aggressive for instant feel
    private static let loadTimeout: TimeInterval = 3.0

    // -- Smart seek offsets by content type --
    // Movies: skip deep past logos, certificates, studio cards, title sequence
    private static let movieSeekFraction: Double = 0.18
    private static let movieMinSeekSeconds: Double = 180   // at least 3 minutes in
    private static let movieMaxSeekSeconds: Double = 1800  // cap at 30 minutes

    // Series episodes: skip past cold open + title sequence
    private static let seriesSeekFraction: Double = 0.22
    private static let seriesMinSeekSeconds: Double = 90   // at least 1.5 minutes in
    private static let seriesMaxSeekSeconds: Double = 600  // cap at 10 minutes

    // Generic fallback
    private static let fallbackSeekFraction: Double = 0.15
    private static let fallbackMinSeekSeconds: Double = 60
    private static let fallbackMaxSeekSeconds: Double = 900

    func startPreview(for item: PlaylistItem) {
        guard !didStart else { return }
        didStart = true

        state = .loading
        isReady = false
        currentContentType = item.contentType
        // Keep hero in "preview-first" loading state for movie/series until proven unavailable.
        hasPreviewSource = (item.contentType == .movie || item.contentType == .series)

        startTask?.cancel()
        startTask = Task { [weak self] in
            guard let self else { return }

            // Phase 1: Try trailer/teaser/preview sources (purpose-made, no seek needed)
            let trailerURLs = self.extractTrailerURLs(from: item)
            if !trailerURLs.isEmpty {
                self.isTrailerSource = true
                self.hasPreviewSource = true
                let didPlay = await self.tryURLsFast(trailerURLs)
                if !Task.isCancelled, didPlay {
                    withAnimation(.easeIn(duration: 0.4)) {
                        self.state = .ready
                        self.isReady = true
                    }
                    return
                }
            }

            // Phase 2: Fall back to main stream with smart offset
            self.isTrailerSource = false
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

    /// Extract trailer / teaser / preview URLs from item metadata (if available)
    private func extractTrailerURLs(from item: PlaylistItem) -> [URL] {
        guard let meta = item.metadata else { return [] }
        var urls: [URL] = []
        // Check common metadata keys for trailer/teaser/preview sources
        let keys = ["trailer_url", "trailerUrl", "trailer",
                     "teaser_url", "teaserUrl", "teaser",
                     "preview_url", "previewUrl", "preview"]
        for key in keys {
            if let value = meta[key]?.value as? String,
               !value.isEmpty,
               let url = URL(string: value) {
                urls.append(url)
            }
        }
        return urls
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
        // Use a timeout so a slow episode fetch doesn't block preview entirely.
        if item.contentType == .series {
            do {
                let episodes = try await withThrowingTaskGroup(of: SeriesEpisodesResponse.self) { group in
                    group.addTask {
                        try await DataService.shared.fetchSeriesEpisodes(streamUrl: item.streamUrl)
                    }
                    group.addTask {
                        try await Task.sleep(nanoseconds: 2_000_000_000) // 2s timeout
                        throw CancellationError()
                    }
                    let result = try await group.next()!
                    group.cancelAll()
                    return result
                }
                let sorted = episodes.seasons
                    .sorted { $0.season < $1.season }
                    .flatMap { season in
                        season.episodes.sorted { $0.episode < $1.episode }
                    }

                // Only use first episode for speed — no need to try 3
                if let episode = sorted.first {
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

    /// Sequential URL trial with single AVPlayer — fast, no probing overhead.
    /// Tries each URL with a short per-URL timeout. First to play wins.
    private func tryURLsFast(_ urls: [URL]) async -> Bool {
        guard !urls.isEmpty else { return false }

        let perURLTimeout: TimeInterval = 1.5  // fast fail per URL
        let totalDeadline = Date().addingTimeInterval(Self.loadTimeout)

        for url in urls {
            guard Date() < totalDeadline else { break }

            let asset = AVURLAsset(url: url, options: [
                "AVURLAssetHTTPHeaderFieldsKey": [
                    "User-Agent": "VLC/3.0.21 LibVLC/3.0.21"
                ]
            ])
            let playerItem = AVPlayerItem(asset: asset)
            playerItem.preferredForwardBufferDuration = 0
            playerItem.canUseNetworkResourcesForLiveStreamingWhilePaused = true

            player.replaceCurrentItem(with: playerItem)
            player.automaticallyWaitsToMinimizeStalling = false
            player.isMuted = true
            player.playImmediately(atRate: 1.0)

            // Wait for this URL to start playing (short timeout)
            let urlDeadline = Date().addingTimeInterval(perURLTimeout)
            var started = false
            while Date() < urlDeadline && Date() < totalDeadline {
                if player.timeControlStatus == .playing {
                    started = true
                    break
                }
                if playerItem.status == .failed { break }
                try? await Task.sleep(nanoseconds: 50_000_000) // 50ms
                guard !Task.isCancelled else { return false }
            }

            if started {
                previewStartTime = .zero
                if !isTrailerSource {
                    Task { [weak self] in await self?.seekToStrongScene() }
                }
                setupClipLoop()
                return true
            }
            // This URL failed — try next
        }

        // All URLs exhausted
        player.replaceCurrentItem(with: nil)
        return false
    }

    /// Compute smart seek offset based on content type and total duration.
    /// Returns a time that skips past logos, advisories, title cards, and weak opening material.
    private func smartSeekTime(totalSeconds: Double) -> CMTime {
        let fraction: Double
        let minSeek: Double
        let maxSeek: Double

        switch currentContentType {
        case .movie:
            fraction = Self.movieSeekFraction
            minSeek  = Self.movieMinSeekSeconds
            maxSeek  = Self.movieMaxSeekSeconds
        case .series:
            fraction = Self.seriesSeekFraction
            minSeek  = Self.seriesMinSeekSeconds
            maxSeek  = Self.seriesMaxSeekSeconds
        default:
            fraction = Self.fallbackSeekFraction
            minSeek  = Self.fallbackMinSeekSeconds
            maxSeek  = Self.fallbackMaxSeekSeconds
        }

        // Fraction-based target, clamped between absolute min and max
        let raw = totalSeconds * fraction
        let clamped = min(max(raw, minSeek), maxSeek)
        // Safety: never seek past 40% of the content
        let safe = min(clamped, totalSeconds * 0.40)
        return CMTime(seconds: safe, preferredTimescale: 600)
    }

    /// Seek to a strong cinematic scene after playback has started (non-blocking).
    /// If the initial seek lands on a stall/black region, nudge forward automatically.
    private func seekToStrongScene() async {
        // Wait for duration to become available (up to 1 second)
        for _ in 0..<10 {
            guard !Task.isCancelled else { return }
            guard let item = player.currentItem else { return }
            let dur = item.duration
            if dur.isValid && !dur.isIndefinite {
                let totalSeconds = CMTimeGetSeconds(dur)
                // Only seek if content is long enough to have intro material
                guard totalSeconds > 30 else { return }

                let seekTarget = smartSeekTime(totalSeconds: totalSeconds)
                await player.seek(to: seekTarget, toleranceBefore: .zero,
                                  toleranceAfter: CMTime(seconds: 2, preferredTimescale: 600))
                previewStartTime = seekTarget

                // Black-frame / stall avoidance: check if playback advances.
                // If the player is stuck at the same position after 0.4s, nudge forward.
                let posAfterSeek = CMTimeGetSeconds(player.currentTime())
                try? await Task.sleep(nanoseconds: 400_000_000)
                guard !Task.isCancelled else { return }
                let posAfterWait = CMTimeGetSeconds(player.currentTime())

                if abs(posAfterWait - posAfterSeek) < 0.1 {
                    // Likely stuck on a black frame or unbuffered region — nudge +30s
                    let nudge = CMTime(seconds: min(CMTimeGetSeconds(seekTarget) + 30, totalSeconds * 0.45),
                                       preferredTimescale: 600)
                    await player.seek(to: nudge, toleranceBefore: .zero,
                                      toleranceAfter: CMTime(seconds: 3, preferredTimescale: 600))
                    previewStartTime = nudge
                }
                return
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }

        // Duration never became available — apply a safe absolute offset
        // so we at least skip past common 1-2 minute intro junk.
        let fallbackOffset = CMTime(seconds: currentContentType == .movie ? 180 : 90,
                                    preferredTimescale: 600)
        await player.seek(to: fallbackOffset, toleranceBefore: .zero,
                          toleranceAfter: CMTime(seconds: 5, preferredTimescale: 600))
        previewStartTime = fallbackOffset
    }

    /// Start observing actual playback status (retained properly).
    /// Once `isActuallyPlaying` becomes true, it stays true during transient
    /// seek/buffer pauses to prevent poster flash. Only explicit stop resets it.
    private func setupPlaybackObserver() {
        playbackStatusObserver?.cancel()
        playbackStatusObserver = player.publisher(for: \.timeControlStatus)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                guard let self else { return }
                if status == .playing {
                    self.isActuallyPlaying = true
                } else if status == .paused, self.player.rate == 0 {
                    // Only mark not-playing on explicit pause (rate == 0),
                    // not during transient buffering/seeking
                    self.isActuallyPlaying = false
                }
                // .waitingToPlayAtSpecifiedRate → keep isActuallyPlaying as-is
            }
    }

    /// Loop the preview and track progress for the red bar
    private func setupClipLoop() {
        setupPlaybackObserver()

        if let token = timeObserverToken {
            player.removeTimeObserver(token)
            timeObserverToken = nil
        }

        timeObserverToken = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.1, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            MainActor.assumeIsolated {
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
    }

    func toggleMute() {
        isMuted.toggle()
        player.isMuted = isMuted
    }

    func togglePlayPause() {
        if isActuallyPlaying {
            player.pause()
        } else {
            player.play()
        }
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
        playbackStatusObserver?.cancel()
        playbackStatusObserver = nil
        isReady = false
        isActuallyPlaying = false
        previewProgress = 0
        state = .idle
        hasPreviewSource = false
        didStart = false
        isTrailerSource = false
    }
}
