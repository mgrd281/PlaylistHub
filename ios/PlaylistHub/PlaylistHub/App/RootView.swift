import SwiftUI

struct RootView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var showSplash = true

    var body: some View {
        ZStack {
            if showSplash {
                SplashView()
                    .transition(.opacity)
            } else if authManager.isAuthenticated {
                MainTabView()
                    .transition(.opacity)
            } else {
                LoginView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.4), value: showSplash)
        .animation(.easeInOut(duration: 0.3), value: authManager.isAuthenticated)
        .task {
            await authManager.restoreSession()
            try? await Task.sleep(for: .seconds(1.2))
            withAnimation { showSplash = false }
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "square.grid.2x2.fill")
                }
                .tag(AppState.AppTab.dashboard)

            LiveTVView()
                .tabItem {
                    Label("Live TV", systemImage: "tv.fill")
                }
                .tag(AppState.AppTab.liveTV)

            PlaylistsView()
                .tabItem {
                    Label("Playlists", systemImage: "list.bullet.rectangle.portrait.fill")
                }
                .tag(AppState.AppTab.playlists)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(AppState.AppTab.settings)
        }
        .tint(.red)
    }
}
