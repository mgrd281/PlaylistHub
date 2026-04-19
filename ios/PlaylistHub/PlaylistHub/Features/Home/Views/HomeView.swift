import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var vm = HomeViewModel()
    @State private var showAddSheet = false

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
                            Text(authManager.currentUser?.displayName ?? authManager.currentUser?.email.components(separatedBy: "@").first ?? "User")
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

                    // Stats grid
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        StatCard(title: "Playlists", value: "\(vm.playlists.count)", icon: "list.bullet.rectangle.portrait.fill", color: .red)
                        StatCard(title: "Channels", value: vm.totalChannels.abbreviated, icon: "tv.fill", color: .blue)
                        StatCard(title: "Movies", value: vm.totalMovies.abbreviated, icon: "film.fill", color: .purple)
                        StatCard(title: "Series", value: vm.totalSeries.abbreviated, icon: "rectangle.stack.fill", color: .orange)
                    }
                    .padding(.horizontal, 20)

                    // Playlists section
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Playlists")
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            Button {
                                showAddSheet = true
                            } label: {
                                Image(systemName: "plus")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 26, height: 26)
                                    .background(.red, in: Circle())
                            }
                        }
                        .padding(.horizontal, 20)

                        if vm.playlists.isEmpty && !vm.isLoading {
                            EmptyStateView(
                                icon: "list.bullet.rectangle.portrait",
                                title: "No playlists yet",
                                subtitle: "Add your first M3U or Xtream playlist to get started."
                            )
                            .padding(.top, 20)
                        } else {
                            LazyVStack(spacing: 8) {
                                ForEach(vm.playlists) { playlist in
                                    NavigationLink {
                                        PlaylistDetailView(playlist: playlist)
                                    } label: {
                                        PlaylistRow(playlist: playlist)
                                    }
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        Button(role: .destructive) {
                                            vm.deleteTarget = playlist
                                            vm.showDeleteConfirm = true
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                }
                .padding(.bottom, 40)
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.large)
            .refreshable { await vm.load() }
            .overlay {
                if vm.isLoading && vm.playlists.isEmpty {
                    ProgressView()
                }
            }
            .sheet(isPresented: $showAddSheet) {
                AddPlaylistSheet(onAdded: { playlist in
                    vm.playlists.insert(playlist, at: 0)
                    showAddSheet = false
                })
                .presentationDetents([.medium])
            }
            .alert("Delete Playlist?", isPresented: $vm.showDeleteConfirm, presenting: vm.deleteTarget) { playlist in
                Button("Delete", role: .destructive) {
                    Task { await vm.delete(playlist) }
                }
                Button("Cancel", role: .cancel) {}
            } message: { playlist in
                Text("This will permanently delete \"\(playlist.name)\" and all its content.")
            }
        }
        .task { await vm.load() }
    }
}

// MARK: - ViewModel

@MainActor
final class HomeViewModel: ObservableObject {
    @Published var playlists: [Playlist] = []
    @Published var isLoading = false
    @Published var showDeleteConfirm = false
    @Published var deleteTarget: Playlist?

    var totalChannels: Int { playlists.reduce(0) { $0 + $1.channelsCount } }
    var totalMovies: Int { playlists.reduce(0) { $0 + $1.moviesCount } }
    var totalSeries: Int { playlists.reduce(0) { $0 + $1.seriesCount } }

    func load() async {
        isLoading = true
        do { playlists = try await DataService.shared.fetchPlaylists() } catch {}
        isLoading = false
    }

    func delete(_ playlist: Playlist) async {
        do {
            try await DataService.shared.deletePlaylist(id: playlist.id)
            playlists.removeAll { $0.id == playlist.id }
        } catch {}
    }
}
