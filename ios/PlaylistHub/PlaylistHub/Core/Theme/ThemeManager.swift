import SwiftUI

// MARK: - Accent Presets

enum AccentPreset: String, CaseIterable, Identifiable {
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

    var hex: String { self.color.toHex() }
    var displayName: String { rawValue.capitalized }
}

// MARK: - Theme Manager

@MainActor
final class ThemeManager: ObservableObject {
    static let shared = ThemeManager()
    static let defaultHex = AccentPreset.red.color.toHex()

    private static let colorKey = "ph_accent_hex"
    private static let recentsKey = "ph_accent_recents"
    private static let maxRecents = 6

    /// The current accent color — single source of truth.
    @Published var accentColor: Color {
        didSet {
            let hex = accentColor.toHex()
            UserDefaults.standard.set(hex, forKey: Self.colorKey)
            addToRecents(hex)
        }
    }

    /// Recently used custom colors (hex strings, newest first).
    @Published private(set) var recentHexColors: [String]

    private init() {
        let hex = UserDefaults.standard.string(forKey: Self.colorKey) ?? Self.defaultHex
        self.accentColor = Color(hex: hex) ?? AccentPreset.red.color
        self.recentHexColors = (UserDefaults.standard.stringArray(forKey: Self.recentsKey) ?? [])
            .prefix(Self.maxRecents).map { $0 }
    }

    // MARK: - Convenience

    /// Select a preset color.
    func selectPreset(_ preset: AccentPreset) {
        accentColor = preset.color
    }

    /// Reset to the default accent (Red).
    func resetToDefault() {
        accentColor = AccentPreset.red.color
    }

    /// Whether the current color matches a preset.
    func matchingPreset() -> AccentPreset? {
        let current = accentColor.toHex()
        return AccentPreset.allCases.first { $0.color.toHex() == current }
    }

    /// Display label for the current color.
    var colorLabel: String {
        matchingPreset()?.displayName ?? accentColor.toHex().uppercased()
    }

    /// Whether current color is the default.
    var isDefault: Bool {
        accentColor.toHex() == Self.defaultHex
    }

    // MARK: - Contrast Safety

    /// Returns a contrast-safe version of the accent for text on dark backgrounds.
    /// Boosts luminance if the color is too dark to read.
    var safeAccentColor: Color {
        accentColor.ensureMinimumLuminance(0.35)
    }

    // MARK: - Recents

    private func addToRecents(_ hex: String) {
        // Don't store presets in recents
        if AccentPreset.allCases.contains(where: { $0.color.toHex() == hex }) { return }
        var list = recentHexColors.filter { $0 != hex }
        list.insert(hex, at: 0)
        if list.count > Self.maxRecents { list = Array(list.prefix(Self.maxRecents)) }
        recentHexColors = list
        UserDefaults.standard.set(list, forKey: Self.recentsKey)
    }
}

// MARK: - Color ↔ Hex

extension Color {
    /// Create a Color from a hex string like "#EB3836" or "EB3836".
    init?(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let int = UInt64(h, radix: 16) else { return nil }
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }

    /// Convert to 6-digit hex string with "#" prefix.
    func toHex() -> String {
        let c = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X",
                      Int(round(r * 255)), Int(round(g * 255)), Int(round(b * 255)))
    }

    /// Returns a brighter version if relative luminance is below `minLum`.
    func ensureMinimumLuminance(_ minLum: Double) -> Color {
        let c = UIColor(self)
        var h: CGFloat = 0, s: CGFloat = 0, br: CGFloat = 0, a: CGFloat = 0
        c.getHue(&h, saturation: &s, brightness: &br, alpha: &a)
        let lum = relativeLuminance()
        guard lum < minLum else { return self }
        // Increase brightness to meet minimum
        let boosted = min(br * (minLum / max(lum, 0.01)) * 0.7 + 0.3, 1.0)
        return Color(UIColor(hue: h, saturation: s * 0.85, brightness: boosted, alpha: a))
    }

    private func relativeLuminance() -> Double {
        let c = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        func linearize(_ v: CGFloat) -> Double {
            let d = Double(v)
            return d <= 0.03928 ? d / 12.92 : pow((d + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
    }
}

// MARK: - Migration (keep old enum available as type alias)

typealias AccentTheme = AccentPreset
