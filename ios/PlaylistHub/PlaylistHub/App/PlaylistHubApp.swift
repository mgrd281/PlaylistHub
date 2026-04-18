import SwiftUI

@main
struct PlaylistHubApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .environmentObject(appState)
                .preferredColorScheme(.dark)
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var selectedTab: AppTab = .dashboard

    enum AppTab: Int, CaseIterable {
        case dashboard, playlists, settings
    }
}
