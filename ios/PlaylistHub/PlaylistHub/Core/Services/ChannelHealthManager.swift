import Foundation

// MARK: - Channel Health Manager
//
// Tracks playback health of live TV channels. Persists results to disk so
// the app learns which channels work and which are dead over time.
//
// Health states:
//   .unknown   — never tested (default)
//   .working   — successfully played within TTL
//   .failed    — all cascade URLs failed within TTL
//
// Results expire after `resultTTL` seconds so channels get re-tested
// periodically in case providers fix/break streams.

@MainActor
final class ChannelHealthManager {
    static let shared = ChannelHealthManager()

    // MARK: - Types

    enum ChannelStatus: Int, Codable {
        case unknown = 0
        case working = 1
        case failed  = 2
    }

    struct HealthRecord: Codable {
        var status: ChannelStatus
        var lastChecked: Date
        /// Number of consecutive failures (resets on success)
        var failCount: Int
        /// Total successful plays
        var successCount: Int
    }

    // MARK: - Storage

    /// streamURL → HealthRecord
    private var records: [String: HealthRecord] = [:]

    /// How long a result is valid before re-testing (1 hour)
    private let resultTTL: TimeInterval = 3600

    private let diskURL: URL = {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        return dir.appendingPathComponent("ph_channel_health.json")
    }()

    // MARK: - Init

    private init() {
        loadFromDisk()
    }

    // MARK: - Public API

    /// Get the current health status for a channel
    func status(for streamURL: String) -> ChannelStatus {
        guard let record = records[streamURL] else { return .unknown }
        // Expire old results
        if Date().timeIntervalSince(record.lastChecked) > resultTTL {
            return .unknown
        }
        return record.status
    }

    /// Record a successful playback
    func markWorking(_ streamURL: String) {
        var record = records[streamURL] ?? HealthRecord(status: .unknown, lastChecked: Date(), failCount: 0, successCount: 0)
        record.status = .working
        record.lastChecked = Date()
        record.failCount = 0
        record.successCount += 1
        records[streamURL] = record
        saveToDiskDebounced()
    }

    /// Record a failed playback (all cascade URLs exhausted)
    func markFailed(_ streamURL: String) {
        var record = records[streamURL] ?? HealthRecord(status: .unknown, lastChecked: Date(), failCount: 0, successCount: 0)
        record.status = .failed
        record.lastChecked = Date()
        record.failCount += 1
        records[streamURL] = record
        saveToDiskDebounced()
    }

    /// Score for sorting: higher = better. Working channels score highest,
    /// unknown in the middle, failed lowest. Within each tier, more successes = higher.
    func sortScore(for streamURL: String) -> Int {
        guard let record = records[streamURL] else { return 500 } // unknown = middle
        if Date().timeIntervalSince(record.lastChecked) > resultTTL {
            return 500 // expired = treat as unknown
        }
        switch record.status {
        case .working:
            return 1000 + min(record.successCount, 100) // 1000-1100
        case .unknown:
            return 500
        case .failed:
            return max(0, 100 - record.failCount * 10) // 0-100
        }
    }

    /// Check if a channel is known to be dead (within TTL)
    func isKnownDead(_ streamURL: String) -> Bool {
        status(for: streamURL) == .failed
    }

    /// Total known-working channels count
    var workingCount: Int {
        records.values.filter { $0.status == .working && Date().timeIntervalSince($0.lastChecked) <= resultTTL }.count
    }

    /// Clear all health data
    func reset() {
        records.removeAll()
        try? FileManager.default.removeItem(at: diskURL)
    }

    // MARK: - Persistence

    private func loadFromDisk() {
        guard let data = try? Data(contentsOf: diskURL),
              let decoded = try? JSONDecoder().decode([String: HealthRecord].self, from: data) else { return }
        // Only keep non-expired entries
        let now = Date()
        records = decoded.filter { now.timeIntervalSince($0.value.lastChecked) <= resultTTL * 24 } // keep 24x TTL on disk, expire in memory
    }

    private var saveWorkItem: DispatchWorkItem?

    private func saveToDiskDebounced() {
        saveWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                self.persistToDisk()
            }
        }
        saveWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
    }

    private func persistToDisk() {
        guard let data = try? JSONEncoder().encode(records) else { return }
        try? data.write(to: diskURL, options: .atomic)
    }
}
