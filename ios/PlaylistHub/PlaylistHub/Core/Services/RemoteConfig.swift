import SwiftUI
import Combine

// MARK: - Remote Configuration Service
//
// Server-driven architecture: the app fetches a JSON config from the backend on launch
// and periodically thereafter. All user-facing strings, section ordering, layout constants,
// category definitions, and feature flags live in this config. Changes take effect without
// a new App Store build.
//
// Compliant with Apple App Store Review Guidelines §3.3.2:
// - No downloaded executable code
// - Config only controls content, layout, and presentation
// - All rendering logic remains native SwiftUI compiled into the binary

@MainActor
final class RemoteConfigService: ObservableObject {
    static let shared = RemoteConfigService()

    @Published private(set) var config: AppRemoteConfig

    /// How often to re-fetch config (seconds)
    private let refreshInterval: TimeInterval = 300 // 5 minutes

    private let diskCacheURL: URL = {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        return dir.appendingPathComponent("ph_remote_config.json")
    }()

    private var refreshTask: Task<Void, Never>?

    private init() {
        // 1) Load from disk cache (instant, offline-safe)
        if let data = try? Data(contentsOf: diskCacheURL),
           let cached = try? JSONDecoder().decode(AppRemoteConfig.self, from: data) {
            self.config = cached
        } else {
            // 2) Fallback: compiled-in defaults (always works)
            self.config = .defaults
        }
    }

    /// Fetch from server, merge with defaults, cache to disk
    func fetchLatest() async {
        let url = AppConfig.webAppBaseURL.appendingPathComponent("/api/config")
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 8
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
            let remote = try JSONDecoder().decode(AppRemoteConfig.self, from: data)
            self.config = remote
            // Persist to disk
            try? data.write(to: diskCacheURL, options: .atomic)
            print("[RemoteConfig] ✓ Updated from server (v\(remote.version))")
        } catch {
            print("[RemoteConfig] ✗ Fetch failed: \(error.localizedDescription)")
        }
    }

    /// Start periodic refresh loop
    func startPeriodicRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(refreshInterval))
                guard !Task.isCancelled else { break }
                await fetchLatest()
            }
        }
    }

    func stopPeriodicRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
    }
}

// MARK: - Config Model

struct AppRemoteConfig: Codable {
    let version: Int

    // ── App Identity ──
    let appName: String
    let tagline: String
    let attribution: String

    // ── Splash ──
    let splash: SplashConfig

    // ── Tabs ──
    let tabs: [TabConfig]

    // ── Home Sections ──
    let homeSections: [HomeSectionConfig]

    // ── Quick Actions ──
    let quickActions: [QuickActionConfig]

    // ── Strings ──
    let strings: StringsConfig

    // ── Player ──
    let player: PlayerConfig

    // ── Content ──
    let content: ContentConfig

    // ── Live TV Categories ──
    let liveCategories: [LiveCategoryConfig]?

    // ── Stream ──
    let stream: StreamConfig

    // ── Cache ──
    let cache: CacheConfig

    // ── Feature Flags ──
    let features: FeatureFlags

    // ── Layout ──
    let layout: LayoutConfig
}

// MARK: - Sub-Configs

struct SplashConfig: Codable {
    let logoIcon: String
    let durationSeconds: Double
    let animationEnabled: Bool
}

struct TabConfig: Codable, Identifiable {
    let id: String           // "home", "liveTV", "movies", "series", "settings"
    let label: String
    let icon: String         // SF Symbol name
    let enabled: Bool
    let order: Int
}

struct HomeSectionConfig: Codable, Identifiable {
    let id: String           // "hero", "quickActions", "stats", "continueWatching", "featuredMovies", "featuredSeries", "playlists"
    let enabled: Bool
    let order: Int
    let title: String?
    let icon: String?
    let maxItems: Int?
}

struct QuickActionConfig: Codable, Identifiable {
    let id: String           // "liveTV", "movies", "series", "add"
    let icon: String
    let title: String
    let subtitle: String?
    let gradientColors: [String]  // hex colors
    let enabled: Bool
    let order: Int
    let destination: String  // tab name or "addPlaylist"
}

struct StringsConfig: Codable {
    // Greetings
    let greetingMorning: String
    let greetingAfternoon: String
    let greetingEvening: String
    let greetingNight: String

    // Common
    let liveBadge: String
    let retryButton: String
    let cancelButton: String
    let deleteButton: String
    let searchPlaceholder: String

    // Empty states
    let emptyPlaylists: String
    let emptyPlaylistsSubtitle: String
    let emptyChannels: String
    let emptyMovies: String
    let emptySeries: String

    // Settings
    let settingsTitle: String
    let signOutTitle: String
    let signOutMessage: String
}

struct PlayerConfig: Codable {
    let controlsAutoHideSeconds: Double
    let channelFlashSeconds: Double
    let seekBackwardSeconds: Double
    let seekForwardSeconds: Double
    let watchProgressSaveInterval: Double
    let relatedChannelsMax: Int
    let swipeThreshold: Double
}

struct ContentConfig: Codable {
    let featuredMoviesLimit: Int
    let featuredSeriesLimit: Int
    let recentPlaylistsLimit: Int
    let paginationLimit: Int
    let searchDebounceMs: Int
    let watchHistoryMax: Int
    let watchMinPosition: Double
    let watchCompletionThreshold: Double
    let watchResumeMinPosition: Double
}

struct LiveCategoryConfig: Codable, Identifiable {
    let id: String           // "sports", "news", etc.
    let label: String
    let emoji: String
    let patterns: [String]   // regex patterns for classification
    let order: Int
    let enabled: Bool
}

struct StreamConfig: Codable {
    let sourceTimeoutSeconds: Double
    let userAgent: String
    let forwardBufferSeconds: Double
    let cascadeOrder: [String] // ["direct", "cf", "vercel"]
}

struct CacheConfig: Codable {
    let playlistTTLSeconds: Double
    let channelCacheTTLSeconds: Double
    let imageCacheCountLimit: Int
    let imageCacheSizeMB: Int
    let imageMaxDimension: Int
    let heartbeatIntervalSeconds: Double
}

struct FeatureFlags: Codable {
    let pipEnabled: Bool
    let brightnessGestureEnabled: Bool
    let volumeGestureEnabled: Bool
    let continueWatchingEnabled: Bool
    let featuredContentEnabled: Bool
    let quickActionsEnabled: Bool
    let statsRibbonEnabled: Bool
    let proBadgeEnabled: Bool
}

struct LayoutConfig: Codable {
    let posterCardHeight: CGFloat
    let gridColumns: Int
    let gridSpacing: CGFloat
    let cornerRadius: CGFloat
    let quickActionCardWidth: CGFloat
    let quickActionCardHeight: CGFloat
    let continueWatchingCardWidth: CGFloat
    let continueWatchingCardHeight: CGFloat
    let avatarSize: CGFloat
    let heroGradientHeight: CGFloat
    let channelLogoSize: CGFloat
    let railPosterWidth: CGFloat
}

// MARK: - Compiled-In Defaults

extension AppRemoteConfig {
    static let defaults = AppRemoteConfig(
        version: 0,
        appName: "PlaylistHub",
        tagline: "Your playlists, everywhere",
        attribution: "Ein Unternehmen der karinex.de",
        splash: SplashConfig(
            logoIcon: "play.rectangle.fill",
            durationSeconds: 1.2,
            animationEnabled: true
        ),
        tabs: [
            TabConfig(id: "home", label: "Home", icon: "house.fill", enabled: true, order: 0),
            TabConfig(id: "liveTV", label: "Live TV", icon: "tv.fill", enabled: true, order: 1),
            TabConfig(id: "movies", label: "Movies", icon: "film.fill", enabled: true, order: 2),
            TabConfig(id: "series", label: "Series", icon: "rectangle.stack.fill", enabled: true, order: 3),
            TabConfig(id: "settings", label: "Settings", icon: "gearshape.fill", enabled: true, order: 4)
        ],
        homeSections: [
            HomeSectionConfig(id: "hero", enabled: true, order: 0, title: nil, icon: nil, maxItems: nil),
            HomeSectionConfig(id: "quickActions", enabled: true, order: 1, title: nil, icon: nil, maxItems: nil),
            HomeSectionConfig(id: "stats", enabled: true, order: 2, title: nil, icon: nil, maxItems: nil),
            HomeSectionConfig(id: "continueWatching", enabled: true, order: 3, title: "Continue Watching", icon: "clock.fill", maxItems: nil),
            HomeSectionConfig(id: "favoriteChannels", enabled: true, order: 4, title: "Favorite Channels", icon: "heart.fill", maxItems: nil),
            HomeSectionConfig(id: "featuredMovies", enabled: true, order: 5, title: "Featured Movies", icon: "film.fill", maxItems: 15),
            HomeSectionConfig(id: "top10", enabled: true, order: 6, title: nil, icon: nil, maxItems: 10),
            HomeSectionConfig(id: "featuredSeries", enabled: true, order: 7, title: "Popular Series", icon: "rectangle.stack.fill", maxItems: 15),
            HomeSectionConfig(id: "playlists", enabled: true, order: 8, title: "Your Playlists", icon: nil, maxItems: nil)
        ],
        quickActions: [
            QuickActionConfig(id: "liveTV", icon: "tv.fill", title: "Live TV", subtitle: nil, gradientColors: ["#3399FF", "#33CCCC"], enabled: true, order: 0, destination: "liveTV"),
            QuickActionConfig(id: "movies", icon: "film.fill", title: "Movies", subtitle: nil, gradientColors: ["#9933CC", "#FF66AA"], enabled: true, order: 1, destination: "movies"),
            QuickActionConfig(id: "series", icon: "rectangle.stack.fill", title: "Series", subtitle: nil, gradientColors: ["#FF9933", "#FF3333"], enabled: true, order: 2, destination: "series"),
            QuickActionConfig(id: "add", icon: "plus.circle.fill", title: "Add", subtitle: "New playlist", gradientColors: [], enabled: true, order: 3, destination: "addPlaylist")
        ],
        strings: StringsConfig(
            greetingMorning: "Good morning",
            greetingAfternoon: "Good afternoon",
            greetingEvening: "Good evening",
            greetingNight: "Good night",
            liveBadge: "LIVE",
            retryButton: "Retry",
            cancelButton: "Cancel",
            deleteButton: "Delete",
            searchPlaceholder: "Search...",
            emptyPlaylists: "No playlists yet",
            emptyPlaylistsSubtitle: "Add your first M3U or Xtream playlist to get started.",
            emptyChannels: "No channels available",
            emptyMovies: "No movies found",
            emptySeries: "No series found",
            settingsTitle: "Settings",
            signOutTitle: "Sign Out?",
            signOutMessage: "You'll need to sign in again to access your playlists."
        ),
        player: PlayerConfig(
            controlsAutoHideSeconds: 4,
            channelFlashSeconds: 1.2,
            seekBackwardSeconds: 10,
            seekForwardSeconds: 10,
            watchProgressSaveInterval: 5,
            relatedChannelsMax: 40,
            swipeThreshold: 50
        ),
        content: ContentConfig(
            featuredMoviesLimit: 15,
            featuredSeriesLimit: 15,
            recentPlaylistsLimit: 3,
            paginationLimit: 50,
            searchDebounceMs: 400,
            watchHistoryMax: 50,
            watchMinPosition: 5,
            watchCompletionThreshold: 0.95,
            watchResumeMinPosition: 10
        ),
        liveCategories: nil,  // nil = use compiled-in classifier
        stream: StreamConfig(
            sourceTimeoutSeconds: 6,
            userAgent: "VLC/3.0.21 LibVLC/3.0.21",
            forwardBufferSeconds: 2,
            cascadeOrder: ["direct", "cf", "vercel"]
        ),
        cache: CacheConfig(
            playlistTTLSeconds: 300,
            channelCacheTTLSeconds: 600,
            imageCacheCountLimit: 600,
            imageCacheSizeMB: 80,
            imageMaxDimension: 300,
            heartbeatIntervalSeconds: 300
        ),
        features: FeatureFlags(
            pipEnabled: true,
            brightnessGestureEnabled: true,
            volumeGestureEnabled: true,
            continueWatchingEnabled: true,
            featuredContentEnabled: true,
            quickActionsEnabled: true,
            statsRibbonEnabled: true,
            proBadgeEnabled: true
        ),
        layout: LayoutConfig(
            posterCardHeight: 165,
            gridColumns: 3,
            gridSpacing: 10,
            cornerRadius: 14,
            quickActionCardWidth: 110,
            quickActionCardHeight: 100,
            continueWatchingCardWidth: 260,
            continueWatchingCardHeight: 146,
            avatarSize: 48,
            heroGradientHeight: 180,
            channelLogoSize: 38,
            railPosterWidth: 115
        )
    )
}

// MARK: - Convenience Accessors

extension RemoteConfigService {
    var c: AppRemoteConfig { config }
    var strings: StringsConfig { config.strings }
    var player: PlayerConfig { config.player }
    var content: ContentConfig { config.content }
    var stream: StreamConfig { config.stream }
    var cacheConfig: CacheConfig { config.cache }
    var features: FeatureFlags { config.features }
    var layout: LayoutConfig { config.layout }

    /// Sorted, enabled home sections
    var enabledHomeSections: [HomeSectionConfig] {
        config.homeSections.filter(\.enabled).sorted { $0.order < $1.order }
    }

    /// Sorted, enabled tabs
    var enabledTabs: [TabConfig] {
        config.tabs.filter(\.enabled).sorted { $0.order < $1.order }
    }

    /// Sorted, enabled quick actions
    var enabledQuickActions: [QuickActionConfig] {
        config.quickActions.filter(\.enabled).sorted { $0.order < $1.order }
    }

    /// Home section by ID
    func homeSection(_ id: String) -> HomeSectionConfig? {
        config.homeSections.first { $0.id == id }
    }

    /// Greeting based on time of day
    var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12:  return strings.greetingMorning
        case 12..<17: return strings.greetingAfternoon
        case 17..<22: return strings.greetingEvening
        default:      return strings.greetingNight
        }
    }

    /// Parse hex color string to SwiftUI Color
    static func color(from hex: String) -> Color {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6, let val = UInt64(hex, radix: 16) else { return .gray }
        return Color(
            red: Double((val >> 16) & 0xFF) / 255,
            green: Double((val >> 8) & 0xFF) / 255,
            blue: Double(val & 0xFF) / 255
        )
    }
}
