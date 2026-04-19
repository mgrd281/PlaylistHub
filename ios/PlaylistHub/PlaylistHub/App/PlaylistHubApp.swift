import SwiftUI

@main
struct PlaylistHubApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var appState = AppState()
    @StateObject private var deviceManager = DeviceManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .environmentObject(appState)
                .environmentObject(deviceManager)
                .preferredColorScheme(.dark)
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var selectedTab: AppTab = .dashboard

    enum AppTab: Int, CaseIterable {
        case dashboard, liveTV, playlists, settings
    }
}
