import SwiftUI

struct PlaylistDetailView: View {
    let playlist: Playlist

    @StateObject private var viewModel: PlaylistDetailViewModel
    @State private var selectedItem: PlaylistItem?

    init(playlist: Playlist) {
        self.playlist = playlist
        _viewModel = StateObject(wrappedValue: PlaylistDetailViewModel(playlist: playlist))
    }

    var body: some View {
        VStack(spacing: 0) {
            // Content type tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(PlaylistDetailViewModel.Tab.allCases, id: \.self) { tab in
                        TabPill(
                            title: tab.title,
                            icon: tab.icon,
                            count: viewModel.count(for: tab),
                            isSelected: viewModel.selectedTab == tab
                        ) {
                            viewModel.selectedTab = tab
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }
            .background(Color(.systemBackground))

            Divider()

            // Search
            if viewModel.selectedTab != .categories {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search...", text: $viewModel.searchText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !viewModel.searchText.isEmpty {
                        Button {
                            viewModel.searchText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(.horizontal)
                .padding(.vertical, 8)
            }

            // Content
            Group {
                if viewModel.selectedTab == .categories {
                    categoriesList
                } else {
                    itemsList
                }
            }
        }
        .navigationTitle(playlist.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        Task { await viewModel.scan() }
                    } label: {
                        Label("Re-scan Playlist", systemImage: "arrow.triangle.2.circlepath")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .overlay {
            if viewModel.isScanning {
                ZStack {
                    Color.black.opacity(0.4).ignoresSafeArea()
                    VStack(spacing: 14) {
                        ProgressView()
                            .scaleEffect(1.2)
                        Text("Scanning playlist...")
                            .font(.subheadline.weight(.medium))
                        Text("This may take a moment")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(30)
                    .background(.ultraThickMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
        }
        .fullScreenCover(item: $selectedItem) { item in
            PlayerView(
                item: item,
                channelList: viewModel.currentChannelContext(for: item),
                onNavigate: { newItem in selectedItem = newItem }
            )
        }
        .task {
            await viewModel.loadItems()
        }
        .onChange(of: viewModel.selectedTab) { _, _ in
            Task { await viewModel.loadItems() }
        }
        .onChange(of: viewModel.searchText) { _, _ in
            viewModel.debounceSearch()
        }
    }

    // MARK: - Items List

    private var itemsList: some View {
        Group {
            if viewModel.isLoading && viewModel.items.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.items.isEmpty {
                EmptyStateView(
                    icon: "magnifyingglass",
                    title: "No items found",
                    subtitle: viewModel.searchText.isEmpty
                        ? "This playlist may need scanning."
                        : "Try a different search term."
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(viewModel.items) { item in
                        Button {
                            selectedItem = item
                        } label: {
                            ItemRow(item: item)
                        }
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    }

                    // Pagination
                    if viewModel.hasMore {
                        HStack {
                            Spacer()
                            ProgressView()
                                .task {
                                    await viewModel.loadMore()
                                }
                            Spacer()
                        }
                        .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    // MARK: - Categories List

    private var categoriesList: some View {
        Group {
            if viewModel.isLoading && viewModel.categories.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.categories.isEmpty {
                EmptyStateView(
                    icon: "folder",
                    title: "No categories",
                    subtitle: "Categories appear after scanning."
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(viewModel.categories) { category in
                        HStack {
                            Image(systemName: "folder.fill")
                                .foregroundStyle(.orange)
                            VStack(alignment: .leading) {
                                Text(category.name)
                                    .font(.subheadline.weight(.medium))
                                Text("\(category.itemCount) items")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
            }
        }
    }
}

// MARK: - Tab Pill

struct TabPill: View {
    let title: String
    let icon: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.caption2.weight(.semibold))
                Text(title)
                    .font(.caption.weight(.medium))
                if count > 0 {
                    Text(count.abbreviated)
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(isSelected ? .white.opacity(0.2) : Color(.systemGray5))
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isSelected ? .red : Color(.systemGray6))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
    }
}

// MARK: - Item Row

struct ItemRow: View {
    let item: PlaylistItem

    var body: some View {
        HStack(spacing: 12) {
            // Logo
            Group {
                if let logoURL = item.resolvedLogoURL {
                    AsyncImage(url: logoURL) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                        default:
                            iconFallback
                        }
                    }
                } else {
                    iconFallback
                }
            }
            .frame(width: 40, height: 40)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(item.name)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Image(systemName: item.contentType.iconName)
                        .font(.caption2)
                    if let group = item.groupTitle {
                        Text(group)
                            .lineLimit(1)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer()

            if item.isLive {
                Text("LIVE")
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            Image(systemName: "play.circle.fill")
                .font(.title2)
                .foregroundStyle(.red)
        }
        .padding(.vertical, 4)
    }

    private var iconFallback: some View {
        Image(systemName: item.contentType.iconName)
            .font(.system(size: 16))
            .foregroundStyle(.secondary)
            .frame(width: 40, height: 40)
    }
}

// MARK: - ViewModel

@MainActor
final class PlaylistDetailViewModel: ObservableObject {
    enum Tab: String, CaseIterable {
        case all, channel, movie, series, categories

        var title: String {
            switch self {
            case .all: return "All"
            case .channel: return "Channels"
            case .movie: return "Movies"
            case .series: return "Series"
            case .categories: return "Categories"
            }
        }

        var icon: String {
            switch self {
            case .all: return "square.grid.2x2.fill"
            case .channel: return "tv.fill"
            case .movie: return "film.fill"
            case .series: return "rectangle.stack.fill"
            case .categories: return "folder.fill"
            }
        }
    }

    let playlist: Playlist
    @Published var selectedTab: Tab = .all
    @Published var searchText = ""
    @Published var items: [PlaylistItem] = []
    @Published var categories: [Category] = []
    @Published var isLoading = false
    @Published var isScanning = false
    @Published var page = 1
    @Published var hasMore = false

    private var searchTask: Task<Void, Never>?

    init(playlist: Playlist) {
        self.playlist = playlist
    }

    func count(for tab: Tab) -> Int {
        switch tab {
        case .all: return playlist.totalItems
        case .channel: return playlist.channelsCount
        case .movie: return playlist.moviesCount
        case .series: return playlist.seriesCount
        case .categories: return playlist.categoriesCount
        }
    }

    func loadItems() async {
        page = 1
        isLoading = true

        if selectedTab == .categories {
            do {
                categories = try await DataService.shared.fetchCategories(playlistId: playlist.id)
            } catch {}
            isLoading = false
            return
        }

        let contentType: ContentType? = selectedTab == .all ? nil : ContentType(rawValue: selectedTab.rawValue)
        do {
            let response = try await DataService.shared.fetchItems(
                playlistId: playlist.id,
                contentType: contentType,
                search: searchText.isEmpty ? nil : searchText,
                page: 1,
                limit: 50
            )
            items = response.items
            hasMore = response.page < response.totalPages
        } catch {}
        isLoading = false
    }

    func loadMore() async {
        guard hasMore else { return }
        page += 1

        let contentType: ContentType? = selectedTab == .all ? nil : ContentType(rawValue: selectedTab.rawValue)
        do {
            let response = try await DataService.shared.fetchItems(
                playlistId: playlist.id,
                contentType: contentType,
                search: searchText.isEmpty ? nil : searchText,
                page: page,
                limit: 50
            )
            items.append(contentsOf: response.items)
            hasMore = response.page < response.totalPages
        } catch {}
    }

    func debounceSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await loadItems()
        }
    }

    func scan() async {
        isScanning = true
        do {
            try await DataService.shared.scanPlaylist(id: playlist.id)
            await loadItems()
        } catch {}
        isScanning = false
    }

    /// Returns the channel list for navigation context (items from the same group)
    func currentChannelContext(for item: PlaylistItem) -> [PlaylistItem]? {
        guard item.contentType == .channel else { return nil }
        // If we have items loaded and they're channels, use them as context
        let channels = items.filter { $0.contentType == .channel }
        return channels.count > 1 ? channels : nil
    }
}

#Preview {
    NavigationStack {
        PlaylistDetailView(playlist: Playlist(
            id: UUID(),
            userId: UUID(),
            name: "My Playlist",
            sourceUrl: "https://example.com/playlist.m3u",
            type: .m3u,
            status: .active,
            totalItems: 5000,
            channelsCount: 3000,
            moviesCount: 1500,
            seriesCount: 500,
            categoriesCount: 120,
            lastScanAt: .now,
            errorMessage: nil,
            createdAt: .now,
            updatedAt: .now
        ))
    }
}
