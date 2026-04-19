import SwiftUI

struct SeriesView: View {
    @StateObject private var vm = SeriesViewModel()
    @State private var selectedItem: PlaylistItem?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Playlist picker (only if multiple)
                if vm.playlists.count > 1 {
                    playlistPicker
                }

                // Search bar
                if vm.selectedPlaylist != nil {
                    searchBar
                }

                Divider()

                // Content
                Group {
                    if vm.isLoading && vm.groupedItems.isEmpty && vm.items.isEmpty {
                        VStack { Spacer(); ProgressView(); Spacer() }
                            .frame(maxWidth: .infinity)
                    } else if vm.selectedPlaylist == nil {
                        EmptyStateView(
                            icon: "rectangle.stack",
                            title: "No playlists",
                            subtitle: "Add a playlist to browse series."
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if vm.groupedItems.isEmpty && vm.items.isEmpty && !vm.isLoading {
                        EmptyStateView(
                            icon: "rectangle.stack",
                            title: "No series",
                            subtitle: "This playlist doesn't contain any series yet."
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if !vm.searchText.isEmpty {
                        posterGridView
                    } else {
                        railsView
                    }
                }
            }
            .navigationTitle("Series")
            .navigationBarTitleDisplayMode(.large)
            .refreshable { await vm.loadContent() }
            .fullScreenCover(item: $selectedItem) { item in
                PlayerView(item: item, channelList: nil)
            }
            .onChange(of: vm.searchText) { _, _ in
                vm.debounceSearch()
            }
        }
        .task { await vm.initialize() }
    }

    // MARK: - Playlist Picker

    private var playlistPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(vm.playlists) { playlist in
                    Button {
                        vm.selectPlaylist(playlist)
                    } label: {
                        HStack(spacing: 5) {
                            Text(playlist.name)
                                .lineLimit(1)
                            if playlist.seriesCount > 0 {
                                Text("\(playlist.seriesCount.abbreviated)")
                                    .font(.system(size: 9, weight: .bold))
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(vm.selectedPlaylist?.id == playlist.id ? .white.opacity(0.2) : Color(.systemGray5))
                                    .clipShape(Capsule())
                            }
                        }
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(vm.selectedPlaylist?.id == playlist.id ? .red : Color(.systemGray6))
                        .foregroundStyle(vm.selectedPlaylist?.id == playlist.id ? .white : .primary)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }

    // MARK: - Search

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            TextField("Search series...", text: $vm.searchText)
                .font(.subheadline)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !vm.searchText.isEmpty {
                Button {
                    vm.searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }

    // MARK: - Poster Grid (search results)

    private var posterGridView: some View {
        let columns = [
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10),
        ]
        return ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(vm.items) { item in
                    Button { selectedItem = item } label: {
                        PosterCard(item: item)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 40)

            if vm.hasMore {
                ProgressView().padding(.vertical, 20).task { await vm.loadMore() }
            }
        }
    }

    // MARK: - Show-level Rails

    private var railsView: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                ForEach(vm.groupedItems) { group in
                    SeriesShowRail(
                        title: group.name,
                        items: group.items,
                        onTap: { selectedItem = $0 }
                    )
                }

                if vm.hasMore {
                    ProgressView().padding(.vertical, 20).task { await vm.loadMore() }
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
    }
}

// MARK: - ViewModel

@MainActor
final class SeriesViewModel: ObservableObject {
    @Published var playlists: [Playlist] = []
    @Published var selectedPlaylist: Playlist?
    @Published var items: [PlaylistItem] = []
    @Published var groupedItems: [GroupedItems] = []
    @Published var isLoading = false
    @Published var searchText = ""
    @Published var hasMore = false
    private var page = 1
    private var searchTask: Task<Void, Never>?
    private var hasLoaded = false

    func initialize() async {
        // Skip if already loaded — preserves state across tab switches
        guard !hasLoaded else { return }

        do {
            playlists = try await PlaylistCache.shared.fetchPlaylists()
            if let first = playlists.first(where: { $0.seriesCount > 0 }) ?? playlists.first {
                selectedPlaylist = first
                await loadContent()
            }
        } catch {}
        hasLoaded = true
    }

    func selectPlaylist(_ playlist: Playlist) {
        guard playlist.id != selectedPlaylist?.id else { return }
        selectedPlaylist = playlist
        Task { await loadContent() }
    }

    func loadContent() async {
        guard let playlist = selectedPlaylist else { return }
        page = 1
        isLoading = true
        items = []
        groupedItems = []

        if searchText.isEmpty {
            await loadGrouped(playlist: playlist)
        } else {
            await loadFlat(playlist: playlist)
        }
        isLoading = false
    }

    private func loadGrouped(playlist: Playlist) async {
        do {
            let response = try await DataService.shared.fetchItems(
                playlistId: playlist.id,
                contentType: .series,
                page: 1,
                limit: 500
            )
            var groups: [String: [PlaylistItem]] = [:]
            for item in response.items {
                let key = item.groupTitle ?? ""
                groups[key, default: []].append(item)
            }
            groupedItems = groups
                .map { GroupedItems(name: $0.key, items: $0.value.sorted { $0.name < $1.name }) }
                .sorted { $0.items.count > $1.items.count }
            hasMore = response.page < response.totalPages
        } catch {}
    }

    private func loadFlat(playlist: Playlist) async {
        do {
            let response = try await DataService.shared.fetchItems(
                playlistId: playlist.id,
                contentType: .series,
                search: searchText.isEmpty ? nil : searchText,
                page: 1,
                limit: 50
            )
            items = response.items
            hasMore = response.page < response.totalPages
        } catch {}
    }

    func loadMore() async {
        guard hasMore, let playlist = selectedPlaylist else { return }
        page += 1
        do {
            let response = try await DataService.shared.fetchItems(
                playlistId: playlist.id,
                contentType: .series,
                search: searchText.isEmpty ? nil : searchText,
                page: page,
                limit: searchText.isEmpty ? 500 : 50
            )
            if searchText.isEmpty {
                for item in response.items {
                    let key = item.groupTitle ?? ""
                    if let idx = groupedItems.firstIndex(where: { $0.name == key }) {
                        groupedItems[idx].items.append(item)
                    } else {
                        groupedItems.append(GroupedItems(name: key, items: [item]))
                    }
                }
            } else {
                items.append(contentsOf: response.items)
            }
            hasMore = response.page < response.totalPages
        } catch {}
    }

    func debounceSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await loadContent()
        }
    }
}
