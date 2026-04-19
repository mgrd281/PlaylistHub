import SwiftUI
import AVFoundation

@main
struct PlaylistHubApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var appState = AppState()
    @StateObject private var deviceManager = DeviceManager.shared
    @StateObject private var themeManager = ThemeManager.shared

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
                .preferredColorScheme(.dark)
                .tint(themeManager.accentColor)
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var selectedTab: AppTab = .home

    enum AppTab: Int, CaseIterable {
        case home, liveTV, movies, series, settings
    }
}
