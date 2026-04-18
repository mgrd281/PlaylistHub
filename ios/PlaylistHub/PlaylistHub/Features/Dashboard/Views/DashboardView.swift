import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Welcome
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Welcome back")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text(authManager.currentUser?.displayName ?? authManager.currentUser?.email ?? "User")
                                .font(.title2.bold())
                        }
                        Spacer()
                        Image(systemName: "play.rectangle.fill")
                            .font(.title)
                            .foregroundStyle(.red)
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)

                    // Stats cards
                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible()),
                    ], spacing: 12) {
                        StatCard(title: "Playlists", value: "\(viewModel.playlists.count)", icon: "list.bullet.rectangle.portrait.fill", color: .red)
                        StatCard(title: "Channels", value: viewModel.totalChannels.abbreviated, icon: "tv.fill", color: .blue)
                        StatCard(title: "Movies", value: viewModel.totalMovies.abbreviated, icon: "film.fill", color: .purple)
                        StatCard(title: "Series", value: viewModel.totalSeries.abbreviated, icon: "rectangle.stack.fill", color: .orange)
                    }
                    .padding(.horizontal)

                    // Recent Playlists
                    if !viewModel.playlists.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text("Recent Playlists")
                                    .font(.headline)
                                Spacer()
                                NavigationLink {
                                    PlaylistsView()
                                } label: {
                                    Text("View All")
                                        .font(.subheadline)
                                        .foregroundStyle(.red)
                                }
                            }
                            .padding(.horizontal)

                            ForEach(viewModel.playlists.prefix(3)) { playlist in
                                NavigationLink {
                                    PlaylistDetailView(playlist: playlist)
                                } label: {
                                    PlaylistRow(playlist: playlist)
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal)
                            }
                        }
                    }

                    // Empty state
                    if viewModel.playlists.isEmpty && !viewModel.isLoading {
                        EmptyStateView(
                            icon: "list.bullet.rectangle.portrait",
                            title: "No playlists yet",
                            subtitle: "Add your first M3U/Xtream playlist to get started."
                        )
                        .padding(.top, 40)
                    }
                }
                .padding(.bottom, 40)
            }
            .navigationTitle("Dashboard")
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                await viewModel.load()
            }
            .overlay {
                if viewModel.isLoading && viewModel.playlists.isEmpty {
                    ProgressView()
                }
            }
        }
        .task {
            await viewModel.load()
        }
    }
}

// MARK: - ViewModel

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var playlists: [Playlist] = []
    @Published var isLoading = false

    var totalChannels: Int { playlists.reduce(0) { $0 + $1.channelsCount } }
    var totalMovies: Int { playlists.reduce(0) { $0 + $1.moviesCount } }
    var totalSeries: Int { playlists.reduce(0) { $0 + $1.seriesCount } }

    func load() async {
        isLoading = true
        do {
            playlists = try await DataService.shared.fetchPlaylists()
        } catch {
            // Silent failure — pull-to-refresh to retry
        }
        isLoading = false
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(color)
                Spacer()
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.title.bold())
                    .monospacedDigit()
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .premiumCard()
    }
}

// MARK: - Playlist Row

struct PlaylistRow: View {
    let playlist: Playlist

    var body: some View {
        HStack(spacing: 14) {
            // Status icon
            ZStack {
                Circle()
                    .fill(statusColor.opacity(0.15))
                    .frame(width: 42, height: 42)
                Image(systemName: statusIcon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(statusColor)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(playlist.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                HStack(spacing: 8) {
                    Label("\(playlist.totalItems)", systemImage: "number")
                    if playlist.lastScanAt != nil {
                        Text("•")
                        Text(playlist.lastScanAt!.relativeString)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.quaternary)
        }
        .padding(14)
        .premiumCard()
    }

    private var statusColor: Color {
        switch playlist.status {
        case .active: return .green
        case .scanning: return .blue
        case .error: return .red
        case .pending: return .orange
        case .inactive: return .gray
        }
    }

    private var statusIcon: String {
        switch playlist.status {
        case .active: return "checkmark.circle.fill"
        case .scanning: return "arrow.triangle.2.circlepath"
        case .error: return "exclamationmark.triangle.fill"
        case .pending: return "clock.fill"
        case .inactive: return "moon.fill"
        }
    }
}

// MARK: - Empty state

struct EmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 40))
                .foregroundStyle(.secondary.opacity(0.6))
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }
}

#Preview {
    DashboardView()
        .environmentObject(AuthManager.shared)
        .environmentObject(AppState())
}
