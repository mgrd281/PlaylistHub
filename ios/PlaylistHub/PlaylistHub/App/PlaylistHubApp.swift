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

    // NOTE: The audio session is intentionally NOT configured in init().
    // Activating AVAudioSession during App init runs an early XPC call to
    // mediaserverd before the app has finished launching, which can abort on
    // some iOS versions (_xpc_serializer_pack → unrecognized selector). The
    // session is configured/activated in the scenePhase `.active` handler
    // below, which fires immediately after launch and before any playback.

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
                .onChange(of: scenePhase) {
                    switch scenePhase {
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
