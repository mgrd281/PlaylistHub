import Foundation

// MARK: - My List Manager
//
// Persistent "My List" for movies & series.
// Stores saved item stream URLs with metadata.
// Thread-safe, disk-persisted, MainActor-isolated.

@MainActor
final class MyListManager: ObservableObject {
    static let shared = MyListManager()

    struct ListEntry: Codable {
        let streamURL: String
        let name: String
        let groupTitle: String?
        let logoURL: String?
        let contentType: String
        var addedAt: Date
    }

    @Published private(set) var items: [String: ListEntry] = [:]

    private let diskURL: URL = {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        return dir.appendingPathComponent("ph_my_list.json")
    }()

    private init() { loadFromDisk() }

    func isInList(_ streamURL: String) -> Bool {
        items[streamURL] != nil
    }

    func toggle(item: PlaylistItem) {
        if items[item.streamUrl] != nil {
            items.removeValue(forKey: item.streamUrl)
        } else {
            items[item.streamUrl] = ListEntry(
                streamURL: item.streamUrl,
                name: item.name,
                groupTitle: item.groupTitle,
                logoURL: item.tvgLogo ?? item.logoUrl,
                contentType: item.contentType.rawValue,
                addedAt: Date()
            )
        }
        saveToDisk()
    }

    func remove(streamURL: String) {
        items.removeValue(forKey: streamURL)
        saveToDisk()
    }

    func removeAll() {
        items.removeAll()
        saveToDisk()
    }

    var sortedItems: [ListEntry] {
        items.values.sorted { $0.addedAt > $1.addedAt }
    }

    var count: Int { items.count }

    private func loadFromDisk() {
        guard let data = try? Data(contentsOf: diskURL),
              let decoded = try? JSONDecoder().decode([String: ListEntry].self, from: data) else { return }
        items = decoded
    }

    private func saveToDisk() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: diskURL, options: .atomic)
    }
}
