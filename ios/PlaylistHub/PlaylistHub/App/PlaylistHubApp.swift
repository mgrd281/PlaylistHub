import SwiftUI
import AVFoundation

@main
struct PlaylistHubApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var appState = AppState()
    @StateObject private var deviceManager = DeviceManager.shared
    @StateObject private var themeManager = ThemeManager.shared
    @StateObject private var remoteConfig = RemoteConfigService.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Configure audio session for media playback — required so audio works
        // even when the physical mute switch is on (standard for video/streaming apps)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [])
            try session.setActive(true)
        } catch {
            print("[Audio] Failed to configure audio session: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .environmentObject(appState)
                .environmentObject(deviceManager)
                .environmentObject(themeManager)
                .environmentObject(remoteConfig)
                .preferredColorScheme(.dark)
                .tint(themeManager.accentColor)
                .onChange(of: scenePhase) { phase in
                    switch phase {
                    case .active:
                        // Re-activate audio session on foreground return
                        do {
                            let session = AVAudioSession.sharedInstance()
                            try session.setCategory(.playback, mode: .moviePlayback, options: [])
                            try session.setActive(true)
                        } catch {
                            print("[Audio] Foreground re-activation failed: \(error)")
                        }
                        // Notify all active players to resume
                        NotificationCenter.default.post(name: .appDidBecomeActive, object: nil)
                        // Refresh remote config
                        Task { await remoteConfig.fetchLatest() }
                        remoteConfig.startPeriodicRefresh()
                    case .background:
                        // Keep audio session active for background playback
                        NotificationCenter.default.post(name: .appDidEnterBackground, object: nil)
                        remoteConfig.stopPeriodicRefresh()
                    default:
                        break
                    }
                }
        }
    }
}

// MARK: - App Lifecycle Notifications

extension Notification.Name {
    static let appDidBecomeActive = Notification.Name("appDidBecomeActive")
    static let appDidEnterBackground = Notification.Name("appDidEnterBackground")
}

@MainActor
final class AppState: ObservableObject {
    @Published var selectedTab: AppTab = .home

    enum AppTab: Int, CaseIterable, Identifiable {
        case home, liveTV, movies, series, settings

        var id: String {
            switch self {
            case .home: return "home"
            case .liveTV: return "liveTV"
            case .movies: return "movies"
            case .series: return "series"
            case .settings: return "settings"
            }
        }
    }
}
