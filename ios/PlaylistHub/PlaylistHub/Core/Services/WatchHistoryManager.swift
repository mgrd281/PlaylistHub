import Foundation

// MARK: - Watch History Entry

struct WatchHistoryEntry: Codable, Identifiable {
    let itemId: UUID
    let playlistId: UUID
    let name: String
    let streamUrl: String
    var logoUrl: String?
    var groupTitle: String?
    let contentType: String       // "channel", "movie", "series", "uncategorized"
    var lastPosition: Double      // seconds
    var duration: Double          // seconds (0 for live)
    var lastWatchedAt: Date

    var id: UUID { itemId }

    /// 0…1 progress ratio; live content returns 0
    var progress: Double {
        guard duration > 0 else { return 0 }
        return min(max(lastPosition / duration, 0), 1)
    }

    /// Human-readable remaining time ("12 min left", "1h 24m left")
    var remainingText: String? {
        guard duration > 30, progress < 0.95 else { return nil }
        let remaining = max(duration - lastPosition, 0)
        let mins = Int(remaining) / 60
        if mins < 1 { return nil }
        if mins >= 60 {
            let h = mins / 60
            let m = mins % 60
            return m > 0 ? "\(h)h \(m)m left" : "\(h)h left"
        }
        return "\(mins) min left"
    }

    /// "Watched 45 min ago", "Watched yesterday"
    var watchedAgoText: String {
        let interval = Date().timeIntervalSince(lastWatchedAt)
        if interval < 60 { return "Just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        let days = Int(interval / 86400)
        if days == 1 { return "Yesterday" }
        if days < 7 { return "\(days)d ago" }
        return lastWatchedAt.shortString
    }

    var isLive: Bool { contentType == "channel" }

    var resolvedLogoURL: URL? {
        guard let logoUrl, !logoUrl.isEmpty else { return nil }
        return URL(string: logoUrl)
    }
}

// MARK: - Watch History Manager

@MainActor
final class WatchHistoryManager: ObservableObject {
    static let shared = WatchHistoryManager()

    @Published private(set) var entries: [WatchHistoryEntry] = []

    private let storageKey = "ph_watch_history"
    private let maxEntries = 50

    private init() {
        loadFromDisk()
    }

    // MARK: - Public API

    /// Record or update a watch history entry. Call from PlayerView on periodic updates + teardown.
    func record(
        itemId: UUID,
        playlistId: UUID,
        name: String,
        streamUrl: String,
        logoUrl: String?,
        groupTitle: String?,
        contentType: ContentType,
        position: Double,
        duration: Double
    ) {
        // Skip if position is trivially small (< 5s) and it's not live
        if contentType != .channel && position < 5 { return }

        let entry = WatchHistoryEntry(
            itemId: itemId,
            playlistId: playlistId,
            name: name,
            streamUrl: streamUrl,
            logoUrl: logoUrl,
            groupTitle: groupTitle,
            contentType: contentType.rawValue,
            lastPosition: position,
            duration: duration,
            lastWatchedAt: Date()
        )

        // Remove existing entry for this item
        entries.removeAll { $0.itemId == itemId }
        // Insert at front
        entries.insert(entry, at: 0)
        // Trim to max
        if entries.count > maxEntries {
            entries = Array(entries.prefix(maxEntries))
        }
        saveToDisk()
    }

    /// Items to show in Continue Watching (excludes completed content >95%)
    var continueWatchingItems: [WatchHistoryEntry] {
        entries.filter { entry in
            // Always show live channels
            if entry.isLive { return true }
            // Show VOD that isn't finished (< 95% progress)
            return entry.progress < 0.95
        }
    }

    /// Remove a single entry
    func remove(itemId: UUID) {
        entries.removeAll { $0.itemId == itemId }
        saveToDisk()
    }

    /// Clear all history
    func clearAll() {
        entries = []
        saveToDisk()
    }

    /// Get saved position for an item (for resume)
    func savedPosition(for itemId: UUID) -> Double? {
        guard let entry = entries.first(where: { $0.itemId == itemId }) else { return nil }
        // Don't resume live content or near-start positions
        if entry.isLive { return nil }
        if entry.lastPosition < 10 { return nil }
        // Don't resume near-end (>95%)
        if entry.progress > 0.95 { return nil }
        return entry.lastPosition
    }

    // MARK: - Persistence

    private func saveToDisk() {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    private func loadFromDisk() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([WatchHistoryEntry].self, from: data)
        else { return }
        entries = decoded
    }
}
