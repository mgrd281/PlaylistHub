import Foundation

// MARK: - Channel Favorites Manager
//
// Persistent favorites system for Live TV channels.
// Stores favorite channel stream URLs with metadata.
// Thread-safe, disk-persisted, MainActor-isolated.

@MainActor
final class ChannelFavoritesManager: ObservableObject {
    static let shared = ChannelFavoritesManager()

    struct FavoriteEntry: Codable {
        let streamURL: String
        let channelName: String
        let groupTitle: String?
        let logoURL: String?
        var addedAt: Date
    }

    @Published private(set) var favorites: [String: FavoriteEntry] = [:] // streamURL → entry

    private let diskURL: URL = {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        return dir.appendingPathComponent("ph_channel_favorites.json")
    }()

    private init() {
        loadFromDisk()
    }

    // MARK: - Public API

    func isFavorite(_ streamURL: String) -> Bool {
        favorites[streamURL] != nil
    }

    func toggle(streamURL: String, channelName: String, groupTitle: String?, logoURL: String?) {
        if favorites[streamURL] != nil {
            favorites.removeValue(forKey: streamURL)
        } else {
            favorites[streamURL] = FavoriteEntry(
                streamURL: streamURL,
                channelName: channelName,
                groupTitle: groupTitle,
                logoURL: logoURL,
                addedAt: Date()
            )
        }
        saveToDisk()
    }

    func add(streamURL: String, channelName: String, groupTitle: String?, logoURL: String?) {
        guard favorites[streamURL] == nil else { return }
        favorites[streamURL] = FavoriteEntry(
            streamURL: streamURL,
            channelName: channelName,
            groupTitle: groupTitle,
            logoURL: logoURL,
            addedAt: Date()
        )
        saveToDisk()
    }

    func remove(_ streamURL: String) {
        favorites.removeValue(forKey: streamURL)
        saveToDisk()
    }

    /// All favorites sorted by most recently added
    var sortedFavorites: [FavoriteEntry] {
        favorites.values.sorted { $0.addedAt > $1.addedAt }
    }

    var count: Int { favorites.count }

    // MARK: - Persistence

    private func loadFromDisk() {
        guard let data = try? Data(contentsOf: diskURL),
              let decoded = try? JSONDecoder().decode([String: FavoriteEntry].self, from: data) else { return }
        favorites = decoded
    }

    private func saveToDisk() {
        guard let data = try? JSONEncoder().encode(favorites) else { return }
        try? data.write(to: diskURL, options: .atomic)
    }
}
