import SwiftUI

// MARK: - Accent Theme

enum AccentTheme: String, CaseIterable, Identifiable {
    case red, orange, gold, green, teal, blue, indigo, purple, pink

    var id: String { rawValue }

    var color: Color {
        switch self {
        case .red:    return Color(red: 0.92, green: 0.22, blue: 0.21)
        case .orange: return Color(red: 0.95, green: 0.55, blue: 0.15)
        case .gold:   return Color(red: 0.90, green: 0.75, blue: 0.20)
        case .green:  return Color(red: 0.20, green: 0.78, blue: 0.45)
        case .teal:   return Color(red: 0.18, green: 0.72, blue: 0.75)
        case .blue:   return Color(red: 0.20, green: 0.50, blue: 0.95)
        case .indigo: return Color(red: 0.35, green: 0.30, blue: 0.85)
        case .purple: return Color(red: 0.60, green: 0.25, blue: 0.85)
        case .pink:   return Color(red: 0.92, green: 0.30, blue: 0.55)
        }
    }

    var displayName: String { rawValue.capitalized }
}

// MARK: - Theme Manager

@MainActor
final class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    @Published var accent: AccentTheme {
        didSet { UserDefaults.standard.set(accent.rawValue, forKey: "ph_accent_theme") }
    }

    private init() {
        let saved = UserDefaults.standard.string(forKey: "ph_accent_theme") ?? "red"
        self.accent = AccentTheme(rawValue: saved) ?? .red
    }

    var accentColor: Color { accent.color }
}
