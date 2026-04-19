import AVFoundation
import AVKit
import Combine
import SwiftUI

// MARK: - Preview Player Model
//
// Plays a muted, looping 30-second preview clip in the detail hero.
//
// Strategy:
// 1. Load the VOD stream via fast cascade (direct → CF Worker)
// 2. Seek to ~10% of duration for a cinematic first-frame (skip logos/black)
// 3. Play muted for 30 seconds, then loop back to the seek point
// 4. If stream doesn't start within 4 seconds, give up (artwork fallback)
// 5. Uses VLC user-agent to match PlayerView and avoid server blocks

@MainActor
final class PreviewPlayerModel: ObservableObject {
    @Published var isReady = false
    @Published var isMuted = true

    let player = AVPlayer()
    private var loopObserver: Any?
    private var statusObserver: AnyCancellable?
    private var didStart = false
    private var previewStartTime: CMTime = .zero
    private var timeObserverToken: Any?

    /// Duration of the preview clip in seconds
    private static let clipDuration: Double = 30
    /// Timeout to wait for playback start
    private static let loadTimeout: TimeInterval = 4
    /// Seek target as fraction of total duration (skip logos/intros)
    private static let seekFraction: Double = 0.10

    func startPreview(for item: PlaylistItem) {
        guard !didStart else { return }
        didStart = true

        // Build URL cascade: direct → CF Worker (skip HLS fallback for preview — too slow)
        var urls: [URL] = []
        if let direct = URL(string: item.resolvedStreamURL) { urls.append(direct) }
        urls.append(AppConfig.cfWorkerStreamURL(for: item.resolvedStreamURL))

        Task { await tryURLs(urls) }
    }

    private func tryURLs(_ urls: [URL]) async {
        for url in urls {
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
                    withAnimation(.easeIn(duration: 0.6)) { isReady = true }
                    return
                } else {
                    player.pause()
                    player.replaceCurrentItem(with: nil)
                }
            } catch {
                continue
            }
        }
        // All URLs failed — artwork fallback remains
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
        player.pause()
        if let token = timeObserverToken {
            player.removeTimeObserver(token)
            timeObserverToken = nil
        }
        player.replaceCurrentItem(with: nil)
        if let obs = loopObserver {
            NotificationCenter.default.removeObserver(obs)
            loopObserver = nil
        }
        statusObserver = nil
        isReady = false
    }

    deinit {
        if let obs = loopObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }
}
