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
    @EnvironmentObject private var themeManager: ThemeManager

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(AppState.AppTab.home)

            LiveTVView()
                .tabItem {
                    Label("Live TV", systemImage: "tv.fill")
                }
                .tag(AppState.AppTab.liveTV)

            MoviesView()
                .tabItem {
                    Label("Movies", systemImage: "film.fill")
                }
                .tag(AppState.AppTab.movies)

            SeriesView()
                .tabItem {
                    Label("Series", systemImage: "rectangle.stack.fill")
                }
                .tag(AppState.AppTab.series)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(AppState.AppTab.settings)
        }
        .tint(themeManager.accentColor)
        .task { await prefetch() }
    }

    /// Warm shared caches so first tab load is near-instant
    private func prefetch() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { _ = try? await PlaylistCache.shared.fetchPlaylists() }
            group.addTask { await preloadLiveTVData() }
        }
    }
}
