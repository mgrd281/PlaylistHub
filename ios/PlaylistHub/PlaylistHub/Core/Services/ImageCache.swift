import SwiftUI

/// In-memory image cache backed by NSCache.
/// Shared across the app so poster images survive tab switches,
/// scroll recycling, and NavigationStack pushes.
final class ImageCacheStore {
    static let shared = ImageCacheStore()

    private let cache = NSCache<NSURL, UIImage>()
    private let inflight = NSLock()
    private var pending: [URL: [CheckedContinuation<UIImage?, Never>]] = [:]

    private init() {
        cache.countLimit = 600          // poster count limit
        cache.totalCostLimit = 80_000_000 // ~80 MB
    }

    func image(for url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func store(_ image: UIImage, for url: URL) {
        let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? 100_000
        cache.setObject(image, forKey: url as NSURL, cost: cost)
    }

    /// Download or return cached. Coalesces duplicate in-flight requests.
    func load(url: URL) async -> UIImage? {
        // 1. Check memory cache
        if let cached = image(for: url) { return cached }

        // 2. Coalesce in-flight requests for the same URL
        return await withCheckedContinuation { continuation in
            inflight.lock()
            if var waiters = pending[url] {
                waiters.append(continuation)
                pending[url] = waiters
                inflight.unlock()
                return
            }
            pending[url] = [continuation]
            inflight.unlock()

            Task.detached(priority: .utility) { [weak self] in
                guard let self else { return }
                var result: UIImage?
                defer {
                    self.inflight.lock()
                    let waiters = self.pending.removeValue(forKey: url) ?? []
                    self.inflight.unlock()
                    for w in waiters { w.resume(returning: result) }
                }

                do {
                    let (data, response) = try await URLSession.shared.data(from: url)
                    guard let http = response as? HTTPURLResponse,
                          http.statusCode < 300,
                          let img = UIImage(data: data) else { return }
                    // Downscale large images to save memory
                    let maxDim: CGFloat = 300
                    if img.size.width > maxDim || img.size.height > maxDim {
                        let scale = maxDim / max(img.size.width, img.size.height)
                        let newSize = CGSize(width: img.size.width * scale, height: img.size.height * scale)
                        let renderer = UIGraphicsImageRenderer(size: newSize)
                        let thumb = renderer.image { _ in img.draw(in: CGRect(origin: .zero, size: newSize)) }
                        self.store(thumb, for: url)
                        result = thumb
                    } else {
                        self.store(img, for: url)
                        result = img
                    }
                } catch {}
            }
        }
    }
}

/// Drop-in replacement for AsyncImage with NSCache backing.
/// Images loaded once stay cached across tab switches.
struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    @ViewBuilder let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
            } else if failed {
                placeholder()
            } else {
                placeholder()
                    .task(id: url) {
                        // Reset state when URL changes
                        image = nil
                        failed = false

                        guard let url else { failed = true; return }
                        // Check cache synchronously first (avoids flicker)
                        if let cached = ImageCacheStore.shared.image(for: url) {
                            self.image = cached
                            return
                        }
                        if let loaded = await ImageCacheStore.shared.load(url: url) {
                            self.image = loaded
                        } else {
                            failed = true
                        }
                    }
            }
        }
        .clipped()
    }
}
