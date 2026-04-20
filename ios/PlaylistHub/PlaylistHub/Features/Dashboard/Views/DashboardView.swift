import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Welcome header
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Welcome back")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text((authManager.currentUser?.displayName ?? authManager.currentUser?.email.components(separatedBy: "@").first ?? "User").displayCapitalized)
                                .font(.title2.bold())
                        }
                        Spacer()
                        ZStack {
                            Circle()
                                .fill(.red.opacity(0.12))
                                .frame(width: 44, height: 44)
                            Image(systemName: "play.rectangle.fill")
                                .font(.system(size: 18))
                                .foregroundStyle(.red)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 4)

                    // Stats
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        StatCard(title: "Playlists", value: "\(viewModel.playlists.count)", icon: "list.bullet.rectangle.portrait.fill", color: .red)
                        StatCard(title: "Channels", value: viewModel.totalChannels.abbreviated, icon: "tv.fill", color: .blue)
                        StatCard(title: "Movies", value: viewModel.totalMovies.abbreviated, icon: "film.fill", color: .purple)
                        StatCard(title: "Series", value: viewModel.totalSeries.abbreviated, icon: "rectangle.stack.fill", color: .orange)
                    }
                    .padding(.horizontal, 20)

                    // Recent playlists
                    if !viewModel.playlists.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text("Recent Playlists")
                                    .font(.subheadline.weight(.semibold))
                                Spacer()
                                NavigationLink {
                                    PlaylistsView()
                                } label: {
                                    Text("View All")
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(.red)
                                }
                            }
                            .padding(.horizontal, 20)

                            VStack(spacing: 8) {
                                ForEach(viewModel.playlists.prefix(3)) { playlist in
                                    NavigationLink {
                                        PlaylistDetailView(playlist: playlist)
                                    } label: {
                                        PlaylistRow(playlist: playlist)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }

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
            .refreshable { await viewModel.load() }
            .overlay {
                if viewModel.isLoading && viewModel.playlists.isEmpty {
                    ProgressView()
                }
            }
        }
        .task { await viewModel.load() }
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
        do { playlists = try await DataService.shared.fetchPlaylists() } catch {}
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
                    .font(.system(size: 16))
                    .foregroundStyle(color)
                Spacer()
            }
            Text(value)
                .font(.title2.bold())
                .monospacedDigit()
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: - Playlist Row

struct PlaylistRow: View {
    let playlist: Playlist

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(statusColor.opacity(0.12))
                    .frame(width: 40, height: 40)
                Image(systemName: statusIcon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(statusColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(playlist.name)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text("\(playlist.totalItems) items")
                    if playlist.lastScanAt != nil {
                        Text("·")
                        Text(playlist.lastScanAt!.relativeString)
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.quaternary)
        }
        .padding(12)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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

// MARK: - Empty State

struct EmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 36, weight: .light))
                .foregroundStyle(.secondary.opacity(0.5))
            Text(title)
                .font(.subheadline.weight(.semibold))
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 48)
        }
    }
}

#Preview {
    DashboardView()
        .environmentObject(AuthManager.shared)
        .environmentObject(AppState())
}
