import Foundation

// MARK: - User Browsing Memory
//
// Tracks which categories, countries, and groups the user visits most.
// Used to re-order navigation for faster repeat access.
// Persisted to disk, expires after 30 days of inactivity.

@MainActor
final class BrowsingMemory: ObservableObject {
    static let shared = BrowsingMemory()

    struct VisitRecord: Codable {
        var visitCount: Int
        var lastVisited: Date
    }

    /// category key → visit record
    @Published private(set) var categoryVisits: [String: VisitRecord] = [:]
    /// "categoryKey::groupName" → visit record
    @Published private(set) var groupVisits: [String: VisitRecord] = [:]

    private let expiryDays: TimeInterval = 30 * 86400 // 30 days

    private let diskURL: URL = {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        return dir.appendingPathComponent("ph_browsing_memory.json")
    }()

    private init() {
        loadFromDisk()
    }

    // MARK: - Record visits

    func visitCategory(_ key: String) {
        var record = categoryVisits[key] ?? VisitRecord(visitCount: 0, lastVisited: Date())
        record.visitCount += 1
        record.lastVisited = Date()
        categoryVisits[key] = record
        saveToDiskDebounced()
    }

    func visitGroup(category: String, group: String) {
        let compositeKey = "\(category)::\(group)"
        var record = groupVisits[compositeKey] ?? VisitRecord(visitCount: 0, lastVisited: Date())
        record.visitCount += 1
        record.lastVisited = Date()
        groupVisits[compositeKey] = record
        saveToDiskDebounced()
    }

    // MARK: - Scores

    /// Higher score = more frequently/recently visited
    func categoryScore(_ key: String) -> Double {
        guard let record = categoryVisits[key] else { return 0 }
        let recency = max(0, 1.0 - Date().timeIntervalSince(record.lastVisited) / expiryDays)
        return Double(record.visitCount) * (0.5 + 0.5 * recency)
    }

    func groupScore(category: String, group: String) -> Double {
        let compositeKey = "\(category)::\(group)"
        guard let record = groupVisits[compositeKey] else { return 0 }
        let recency = max(0, 1.0 - Date().timeIntervalSince(record.lastVisited) / expiryDays)
        return Double(record.visitCount) * (0.5 + 0.5 * recency)
    }

    /// Sort groups within a category by user preference
    func sortedGroups(_ groups: [String], inCategory category: String) -> [String] {
        groups.sorted { a, b in
            groupScore(category: category, group: a) > groupScore(category: category, group: b)
        }
    }

    /// Most visited category key (for default selection)
    var mostVisitedCategory: String? {
        categoryVisits
            .filter { Date().timeIntervalSince($0.value.lastVisited) < expiryDays }
            .max { $0.value.visitCount < $1.value.visitCount }?
            .key
    }

    // MARK: - Persistence

    private struct DiskData: Codable {
        var categoryVisits: [String: VisitRecord]
        var groupVisits: [String: VisitRecord]
    }

    private func loadFromDisk() {
        guard let data = try? Data(contentsOf: diskURL),
              let decoded = try? JSONDecoder().decode(DiskData.self, from: data) else { return }
        let now = Date()
        categoryVisits = decoded.categoryVisits.filter { now.timeIntervalSince($0.value.lastVisited) < expiryDays }
        groupVisits = decoded.groupVisits.filter { now.timeIntervalSince($0.value.lastVisited) < expiryDays }
    }

    private var saveWorkItem: DispatchWorkItem?

    private func saveToDiskDebounced() {
        saveWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            Task { @MainActor in self.persistToDisk() }
        }
        saveWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
    }

    private func persistToDisk() {
        let disk = DiskData(categoryVisits: categoryVisits, groupVisits: groupVisits)
        guard let data = try? JSONEncoder().encode(disk) else { return }
        try? data.write(to: diskURL, options: .atomic)
    }
}
