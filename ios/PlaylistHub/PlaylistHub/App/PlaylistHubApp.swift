import SwiftUI

@main
struct PlaylistHubApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var appState = AppState()
    @StateObject private var deviceManager = DeviceManager.shared
    @StateObject private var themeManager = ThemeManager.shared

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
