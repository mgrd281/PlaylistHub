import Foundation
import SwiftUI

// MARK: - Date formatting

extension Date {
    var relativeString: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: self, relativeTo: .now)
    }

    var shortString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }

    var fullString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .medium
        return formatter.string(from: self)
    }
}

// MARK: - Number formatting

extension Int {
    var abbreviated: String {
        if self >= 1_000_000 { return String(format: "%.1fM", Double(self) / 1_000_000) }
        if self >= 1_000 { return String(format: "%.1fK", Double(self) / 1_000) }
        return "\(self)"
    }
}

// MARK: - View modifiers

extension View {
    // Removed unused cardStyle() and premiumCard() — inline styles used instead
}

// MARK: - Color theme

extension Color {
    static let phRed = Color.red
    static let phBackground = Color(.systemBackground)
    static let phSecondary = Color(.secondarySystemBackground)
    static let phGrouped = Color(.systemGroupedBackground)
}

// MARK: - Display name formatting

extension String {
    /// Returns the string with its first character uppercased (display-only, does not mutate stored data).
    /// "mgrdegh" → "Mgrdegh", "already Fine" → "Already Fine", "" → ""
    var displayCapitalized: String {
        guard let first = first else { return self }
        return first.uppercased() + dropFirst()
    }
}
