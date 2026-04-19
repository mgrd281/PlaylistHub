import SwiftUI

struct RootView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var remoteConfig: RemoteConfigService
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
            // Fetch remote config and restore session in parallel during splash
            async let configTask: () = remoteConfig.fetchLatest()
            async let authTask: () = authManager.restoreSession()
            _ = await (configTask, authTask)
            remoteConfig.startPeriodicRefresh()
            try? await Task.sleep(for: .seconds(remoteConfig.config.splash.durationSeconds))
            withAnimation { showSplash = false }
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var themeManager: ThemeManager
    @EnvironmentObject private var remoteConfig: RemoteConfigService

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            ForEach(remoteConfig.enabledTabs) { tab in
                viewForTab(tab.id)
                    .tabItem {
                        Label(tab.label, systemImage: tab.icon)
                    }
                    .tag(AppState.AppTab(rawValue: AppState.AppTab.allCases.firstIndex(where: { $0.id == tab.id }) ?? 0) ?? .home)
            }
        }
        .tint(themeManager.accentColor)
        .task { await prefetch() }
    }

    @ViewBuilder
    private func viewForTab(_ id: String) -> some View {
        switch id {
        case "home": HomeView()
        case "liveTV": LiveTVView()
        case "movies": MoviesView()
        case "series": SeriesView()
        case "settings": SettingsView()
        default: EmptyView()
        }
    }

    /// Warm shared caches so first tab load is near-instant
    private func prefetch() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { _ = try? await PlaylistCache.shared.fetchPlaylists() }
            group.addTask { await preloadLiveTVData() }
        }
    }
}
