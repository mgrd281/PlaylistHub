import AVFoundation
import AVKit
import Combine
import SwiftUI

// MARK: - Preview Player Model
//
// Plays a muted, looping ~30 second preview of a VOD or live stream
// in the hero section of the detail view. Falls back gracefully if
// the stream doesn't load within 6 seconds.

@MainActor
final class PreviewPlayerModel: ObservableObject {
    @Published var isReady = false
    @Published var isMuted = true

    let player = AVPlayer()
    private var loopObserver: Any?
    private var timeoutTask: Task<Void, Never>?
    private var statusObserver: AnyCancellable?
    private var didStart = false

    func startPreview(for item: PlaylistItem) {
        guard !didStart else { return }
        didStart = true

        let urls = AppConfig.vodStreamCascade(
            for: item.resolvedStreamURL,
            hlsFallback: item.hlsFallbackURL
        )

        Task {
            await tryURLs(urls)
        }
    }

    private func tryURLs(_ urls: [URL]) async {
        for url in urls {
            let asset = AVURLAsset(url: url, options: [
                "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": "PlaylistHub/1.0"]
            ])
            do {
                let playable = try await asset.load(.isPlayable)
                guard playable else { continue }

                let playerItem = AVPlayerItem(asset: asset)
                player.replaceCurrentItem(with: playerItem)
                player.isMuted = true
                player.play()

                // Wait for actual playback (max 6 seconds)
                let ready = await waitForPlayback(timeout: 6.0)
                if ready {
                    setupLoop()
                    withAnimation { isReady = true }
                    return
                } else {
                    player.pause()
                    player.replaceCurrentItem(with: nil)
                }
            } catch {
                continue
            }
        }
        // All URLs failed — stay on artwork fallback
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

    private func setupLoop() {
        // Loop playback by observing when the item reaches its end
        let nc = NotificationCenter.default
        loopObserver = nc.addObserver(
            forName: NSNotification.Name("AVPlayerItemDidPlayToEndOfTimeNotification"),
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            self?.player.seek(to: .zero)
            self?.player.play()
        }

        // Also add a periodic check — the notification name varies across iOS versions
        player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 1), queue: .main) { [weak self] time in
            guard let self, let item = self.player.currentItem else { return }
            let duration = item.duration
            guard duration.isValid && !duration.isIndefinite else { return }
            let durationSeconds = CMTimeGetSeconds(duration)
            let currentSeconds = CMTimeGetSeconds(time)
            if durationSeconds > 0 && currentSeconds >= durationSeconds - 0.5 {
                self.player.seek(to: .zero)
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
        player.replaceCurrentItem(with: nil)
        if let obs = loopObserver {
            NotificationCenter.default.removeObserver(obs)
            loopObserver = nil
        }
        timeoutTask?.cancel()
        statusObserver = nil
    }

    deinit {
        if let obs = loopObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }
}
