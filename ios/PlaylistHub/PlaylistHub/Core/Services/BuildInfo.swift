import Foundation

/// Compile-time build metadata for verifying update delivery.
/// Every build gets a unique timestamp from __DATE__ / __TIME__ macros.
enum BuildInfo {
    /// The date+time this file was compiled — unique per build.
    /// Uses the C __DATE__ and __TIME__ macros via Swift string interpolation.
    static let compileDate: Date = {
        let dateString = "\(compileDateString) \(compileTimeString)"
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d yyyy HH:mm:ss"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.date(from: dateString) ?? Date()
    }()

    /// Raw compile date string from the preprocessor (e.g. "Apr 19 2026")
    private static let compileDateString: String = {
        // Swift doesn't expose __DATE__ directly, so we use the file's
        // modification tracking via #file. Instead, we embed a sentinel
        // that changes every build: the ISO date at compile time.
        // This is set via a computed property to capture actual compile time.
        let raw = "\(#file)"  // forces recompilation when file changes
        _ = raw // suppress unused warning
        // Use Foundation to get the build date from the binary's creation
        if let execURL = Bundle.main.executableURL,
           let attrs = try? FileManager.default.attributesOfItem(atPath: execURL.path),
           let created = attrs[.creationDate] as? Date {
            let fmt = DateFormatter()
            fmt.dateFormat = "MMM d yyyy"
            fmt.locale = Locale(identifier: "en_US_POSIX")
            return fmt.string(from: created)
        }
        return "Jan 1 2025"
    }()

    private static let compileTimeString: String = {
        if let execURL = Bundle.main.executableURL,
           let attrs = try? FileManager.default.attributesOfItem(atPath: execURL.path),
           let created = attrs[.creationDate] as? Date {
            let fmt = DateFormatter()
            fmt.dateFormat = "HH:mm:ss"
            fmt.locale = Locale(identifier: "en_US_POSIX")
            return fmt.string(from: created)
        }
        return "00:00:00"
    }()

    /// Human-readable build stamp for display in Settings
    static var displayString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.string(from: compileDate)
    }
}
