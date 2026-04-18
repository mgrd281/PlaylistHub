import SwiftUI

struct PlaylistsView: View {
    @StateObject private var viewModel = PlaylistsViewModel()
    @State private var showAddSheet = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.playlists.isEmpty {
                    VStack { Spacer(); ProgressView(); Spacer() }
                } else if viewModel.playlists.isEmpty {
                    EmptyStateView(
                        icon: "list.bullet.rectangle.portrait",
                        title: "No playlists",
                        subtitle: "Tap + to add your first M3U or Xtream playlist."
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(viewModel.playlists) { playlist in
                                NavigationLink {
                                    PlaylistDetailView(playlist: playlist)
                                } label: {
                                    PlaylistRow(playlist: playlist)
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    Button(role: .destructive) {
                                        viewModel.deleteTarget = playlist
                                        viewModel.showDeleteConfirm = true
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                    }
                }
            }
            .navigationTitle("Playlists")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAddSheet = true } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(.red, in: Circle())
                    }
                }
            }
            .refreshable { await viewModel.load() }
            .sheet(isPresented: $showAddSheet) {
                AddPlaylistSheet(onAdded: { playlist in
                    viewModel.playlists.insert(playlist, at: 0)
                    showAddSheet = false
                })
                .presentationDetents([.medium])
            }
            .alert("Delete Playlist?", isPresented: $viewModel.showDeleteConfirm, presenting: viewModel.deleteTarget) { playlist in
                Button("Delete", role: .destructive) {
                    Task { await viewModel.delete(playlist) }
                }
                Button("Cancel", role: .cancel) {}
            } message: { playlist in
                Text("This will permanently delete \"\(playlist.name)\" and all its content.")
            }
        }
        .task {
            await viewModel.load()
        }
    }
}

// MARK: - ViewModel

@MainActor
final class PlaylistsViewModel: ObservableObject {
    @Published var playlists: [Playlist] = []
    @Published var isLoading = false
    @Published var showDeleteConfirm = false
    @Published var deleteTarget: Playlist?

    func load() async {
        isLoading = true
        do {
            playlists = try await DataService.shared.fetchPlaylists()
        } catch {}
        isLoading = false
    }

    func delete(_ playlist: Playlist) async {
        do {
            try await DataService.shared.deletePlaylist(id: playlist.id)
            playlists.removeAll { $0.id == playlist.id }
        } catch {}
    }
}

// MARK: - Add Playlist Sheet

struct AddPlaylistSheet: View {
    let onAdded: (Playlist) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var url = ""
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Name")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)
                    TextField("My Playlist", text: $name)
                        .padding(14)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Playlist URL")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)
                    TextField("https://example.com/playlist.m3u", text: $url)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(14)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                if let error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                Button {
                    Task { await addPlaylist() }
                } label: {
                    Group {
                        if isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text("Add Playlist")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .disabled(name.isEmpty || url.isEmpty || isLoading)
                .opacity(name.isEmpty || url.isEmpty ? 0.6 : 1)

                Spacer()
            }
            .padding()
            .navigationTitle("Add Playlist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func addPlaylist() async {
        isLoading = true
        error = nil
        do {
            let playlist = try await DataService.shared.createPlaylist(name: name, sourceUrl: url)
            onAdded(playlist)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

#Preview {
    PlaylistsView()
}
