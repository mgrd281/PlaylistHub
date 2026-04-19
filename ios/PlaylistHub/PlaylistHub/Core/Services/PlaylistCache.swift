import Foundation

/// Shared in-memory cache for playlist and item data.
/// Prevents redundant network calls when switching between tabs.
/// All tab ViewModels read from here instead of hitting the network independently.
@MainActor
final class PlaylistCache: ObservableObject {
    static let shared = PlaylistCache()

    @Published var playlists: [Playlist] = []
    @Published var lastFetch: Date?

    /// Items cache keyed by "playlistId:contentType"
    private var itemsCache: [String: CachedItems] = [:]

    private var fetchTask: Task<[Playlist], Error>?

    private init() {}

    struct CachedItems {
        let items: [PlaylistItem]
        let grouped: [GroupedItems]
        let hasMore: Bool
        let fetchedAt: Date
    }

    /// Time-to-live: 5 minutes. After this, data will be refreshed in background.
    private let ttl: TimeInterval = 300

    var isStale: Bool {
        guard let last = lastFetch else { return true }
        return Date().timeIntervalSince(last) > ttl
    }

    /// Fetch playlists — coalesces concurrent calls and caches result.
    func fetchPlaylists(force: Bool = false) async throws -> [Playlist] {
        // Return cache if fresh
        if !force && !isStale && !playlists.isEmpty {
            return playlists
        }

        // Coalesce: if a fetch is already in-flight, await it
        if let task = fetchTask {
            return try await task.value
        }

        let task = Task<[Playlist], Error> {
            let result = try await DataService.shared.fetchPlaylists()
            self.playlists = result
            self.lastFetch = Date()
            self.fetchTask = nil
            return result
        }
        self.fetchTask = task
        return try await task.value
    }

    // MARK: - Items cache

    func cacheKey(playlistId: UUID, contentType: ContentType) -> String {
        "\(playlistId.uuidString):\(contentType.rawValue)"
    }

    func cachedItems(playlistId: UUID, contentType: ContentType) -> CachedItems? {
        let key = cacheKey(playlistId: playlistId, contentType: contentType)
        guard let cached = itemsCache[key] else { return nil }
        // Still valid if within TTL
        if Date().timeIntervalSince(cached.fetchedAt) < ttl {
            return cached
        }
        return nil
    }

    func storeItems(playlistId: UUID, contentType: ContentType, items: [PlaylistItem], grouped: [GroupedItems], hasMore: Bool) {
        let key = cacheKey(playlistId: playlistId, contentType: contentType)
        itemsCache[key] = CachedItems(items: items, grouped: grouped, hasMore: hasMore, fetchedAt: Date())
    }

    func invalidate() {
        playlists = []
        lastFetch = nil
        itemsCache = [:]
        fetchTask = nil
    }

    func invalidateItems(playlistId: UUID, contentType: ContentType) {
        let key = cacheKey(playlistId: playlistId, contentType: contentType)
        itemsCache.removeValue(forKey: key)
    }
}
