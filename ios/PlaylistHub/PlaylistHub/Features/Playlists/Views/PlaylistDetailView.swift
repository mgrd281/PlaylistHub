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
            // Tab pills
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
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
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }

            // Search
            if viewModel.selectedTab != .categories {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                    TextField("Search...", text: $viewModel.searchText)
                        .font(.subheadline)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !viewModel.searchText.isEmpty {
                        Button {
                            viewModel.searchText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(.tertiary)
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

            Divider()

            // Content — route to different layouts per tab
            Group {
                switch viewModel.selectedTab {
                case .categories:
                    categoriesList
                case .movie:
                    mediaLibraryView(contentType: .movie)
                case .series:
                    seriesLibraryView
                case .channel:
                    channelListView
                case .all:
                    allContentView
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
                channelList: viewModel.currentChannelContext(for: item)
            )
        }
        .task {
            await viewModel.loadContent()
        }
        .onChange(of: viewModel.selectedTab) { _, _ in
            Task { await viewModel.loadContent() }
        }
        .onChange(of: viewModel.searchText) { _, _ in
            viewModel.debounceSearch()
        }
    }

    // MARK: - Channel List (row-based — live TV style)

    private var channelListView: some View {
        Group {
            if viewModel.isLoading && viewModel.items.isEmpty {
                VStack { Spacer(); ProgressView(); Spacer() }
                    .frame(maxWidth: .infinity)
            } else if viewModel.items.isEmpty {
                EmptyStateView(icon: "tv", title: "No channels", subtitle: "This playlist may need scanning.")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(viewModel.items) { item in
                            Button { selectedItem = item } label: { ChannelRow(item: item) }
                                .buttonStyle(ItemButtonStyle())
                            if item.id != viewModel.items.last?.id {
                                Divider().padding(.leading, 60)
                            }
                        }
                        if viewModel.hasMore {
                            ProgressView().padding(.vertical, 20).task { await viewModel.loadMore() }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Movie Library (poster grid + category rails)

    private func mediaLibraryView(contentType: ContentType) -> some View {
        Group {
            if viewModel.isLoading && viewModel.groupedItems.isEmpty && viewModel.items.isEmpty {
                VStack { Spacer(); ProgressView(); Spacer() }
                    .frame(maxWidth: .infinity)
            } else if viewModel.groupedItems.isEmpty && viewModel.items.isEmpty {
                EmptyStateView(icon: contentType.iconName, title: "No \(contentType.displayName.lowercased())", subtitle: "This playlist may need scanning.")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !viewModel.searchText.isEmpty {
                // Flat search results as poster grid
                posterGridView(items: viewModel.items)
            } else if viewModel.groupedItems.count == 1, let group = viewModel.groupedItems.first {
                // Single group — show as full grid
                posterGridView(items: group.items)
            } else {
                // Multiple groups — horizontal rails per category
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 20) {
                        ForEach(viewModel.groupedItems) { group in
                            MediaRail(
                                title: group.name,
                                items: group.items,
                                onTap: { selectedItem = $0 }
                            )
                        }

                        if viewModel.hasMore {
                            ProgressView().padding(.vertical, 20).task { await viewModel.loadMore() }
                        }
                    }
                    .padding(.top, 12)
                    .padding(.bottom, 40)
                }
            }
        }
    }

    private func posterGridView(items: [PlaylistItem]) -> some View {
        let columns = [
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10),
        ]
        return ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(items) { item in
                    Button { selectedItem = item } label: {
                        PosterCard(item: item)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 40)

            if viewModel.hasMore {
                ProgressView().padding(.vertical, 20).task { await viewModel.loadMore() }
            }
        }
    }

    // MARK: - Series Library (show-level grouping)

    private var seriesLibraryView: some View {
        Group {
            if viewModel.isLoading && viewModel.groupedItems.isEmpty && viewModel.items.isEmpty {
                VStack { Spacer(); ProgressView(); Spacer() }
                    .frame(maxWidth: .infinity)
            } else if viewModel.groupedItems.isEmpty && viewModel.items.isEmpty {
                EmptyStateView(icon: "rectangle.stack.fill", title: "No series", subtitle: "This playlist may need scanning.")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !viewModel.searchText.isEmpty {
                // Search → flat poster grid
                posterGridView(items: viewModel.items)
            } else {
                // Show-level cards
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 20) {
                        ForEach(viewModel.groupedItems) { group in
                            SeriesShowRail(
                                title: group.name,
                                items: group.items,
                                onTap: { selectedItem = $0 }
                            )
                        }

                        if viewModel.hasMore {
                            ProgressView().padding(.vertical, 20).task { await viewModel.loadMore() }
                        }
                    }
                    .padding(.top, 12)
                    .padding(.bottom, 40)
                }
            }
        }
    }

    // MARK: - All Content (hybrid)

    private var allContentView: some View {
        Group {
            if viewModel.isLoading && viewModel.items.isEmpty {
                VStack { Spacer(); ProgressView(); Spacer() }
                    .frame(maxWidth: .infinity)
            } else if viewModel.items.isEmpty {
                EmptyStateView(icon: "magnifyingglass", title: "No items found", subtitle: viewModel.searchText.isEmpty ? "This playlist may need scanning." : "Try a different search term.")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(viewModel.items) { item in
                            if item.contentType == .channel {
                                Button { selectedItem = item } label: { ChannelRow(item: item) }
                                    .buttonStyle(ItemButtonStyle())
                                Divider().padding(.leading, 60)
                            } else {
                                Button { selectedItem = item } label: {
                                    HStack(spacing: 12) {
                                        PosterCardSmall(item: item)
                                            .frame(width: 60, height: 90)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(item.name)
                                                .font(.subheadline.weight(.medium))
                                                .lineLimit(2)
                                            if let group = item.groupTitle {
                                                Text(group)
                                                    .font(.caption2)
                                                    .foregroundStyle(.secondary)
                                                    .lineLimit(1)
                                            }
                                            Text(item.contentType.displayName)
                                                .font(.system(size: 9, weight: .semibold))
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background(item.contentType == .movie ? Color.purple.opacity(0.15) : Color.orange.opacity(0.15))
                                                .foregroundStyle(item.contentType == .movie ? .purple : .orange)
                                                .clipShape(Capsule())
                                        }
                                        Spacer(minLength: 4)
                                        Image(systemName: "play.fill")
                                            .font(.system(size: 11))
                                            .foregroundStyle(.red)
                                            .frame(width: 28, height: 28)
                                            .background(.red.opacity(0.1))
                                            .clipShape(Circle())
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                }
                                .buttonStyle(ItemButtonStyle())
                                Divider().padding(.leading, 88)
                            }
                        }
                        if viewModel.hasMore {
                            ProgressView().padding(.vertical, 20).task { await viewModel.loadMore() }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Categories List

    private var categoriesList: some View {
        Group {
            if viewModel.isLoading && viewModel.categories.isEmpty {
                VStack { Spacer(); ProgressView(); Spacer() }
                    .frame(maxWidth: .infinity)
            } else if viewModel.categories.isEmpty {
                EmptyStateView(icon: "folder", title: "No categories", subtitle: "Categories appear after scanning.")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(viewModel.categories) { category in
                            HStack(spacing: 12) {
                                Image(systemName: "folder.fill")
                                    .font(.system(size: 16))
                                    .foregroundStyle(.orange)
                                    .frame(width: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(category.name)
                                        .font(.subheadline.weight(.medium))
                                    Text("\(category.itemCount) items")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption2)
                                    .foregroundStyle(.quaternary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)

                            if category.id != viewModel.categories.last?.id {
                                Divider().padding(.leading, 64)
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Poster Card (movie/series artwork)

struct PosterCard: View {
    let item: PlaylistItem

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let url = item.resolvedLogoURL {
                CachedAsyncImage(url: url) {
                    posterFallback
                }
                .aspectRatio(contentMode: .fill)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            } else {
                posterFallback
            }
        }
        .frame(height: 165)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(alignment: .bottomLeading) {
            // Title overlay
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(2)
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 2, y: 1)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(colors: [.black.opacity(0.75), .clear], startPoint: .bottom, endPoint: .top)
            )
            .clipShape(
                UnevenRoundedRectangle(bottomLeadingRadius: 10, bottomTrailingRadius: 10)
            )
        }
        .overlay(alignment: .topTrailing) {
            if item.contentType == .series {
                Image(systemName: "rectangle.stack.fill")
                    .font(.system(size: 8))
                    .foregroundStyle(.white)
                    .padding(4)
                    .background(.black.opacity(0.5), in: Circle())
                    .padding(6)
            }
        }
    }

    private var posterFallback: some View {
        ZStack {
            // Deterministic gradient from title
            LinearGradient(
                colors: PosterCard.gradientColors(for: item.name),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            VStack(spacing: 6) {
                Image(systemName: item.contentType == .movie ? "film.fill" : "rectangle.stack.fill")
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(.white.opacity(0.5))
                Text(item.name)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .padding(.horizontal, 8)
            }
        }
    }

    static func gradientColors(for title: String) -> [Color] {
        let hash = abs(title.hashValue)
        let palettes: [[Color]] = [
            [Color(red: 0.15, green: 0.15, blue: 0.35), Color(red: 0.3, green: 0.1, blue: 0.4)],
            [Color(red: 0.1, green: 0.2, blue: 0.3), Color(red: 0.05, green: 0.15, blue: 0.25)],
            [Color(red: 0.25, green: 0.1, blue: 0.15), Color(red: 0.35, green: 0.1, blue: 0.2)],
            [Color(red: 0.1, green: 0.25, blue: 0.2), Color(red: 0.05, green: 0.2, blue: 0.15)],
            [Color(red: 0.2, green: 0.15, blue: 0.3), Color(red: 0.15, green: 0.1, blue: 0.35)],
            [Color(red: 0.3, green: 0.2, blue: 0.1), Color(red: 0.2, green: 0.12, blue: 0.08)],
        ]
        return palettes[hash % palettes.count]
    }
}

struct PosterCardSmall: View {
    let item: PlaylistItem

    var body: some View {
        ZStack {
            if let url = item.resolvedLogoURL {
                CachedAsyncImage(url: url) {
                    smallFallback
                }
                .aspectRatio(contentMode: .fill)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            } else {
                smallFallback
            }
        }
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var smallFallback: some View {
        ZStack {
            LinearGradient(
                colors: PosterCard.gradientColors(for: item.name),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: item.contentType == .movie ? "film.fill" : "rectangle.stack.fill")
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(.white.opacity(0.5))
        }
    }
}

// MARK: - Media Rail (horizontal scroll of poster cards)

struct MediaRail: View {
    let title: String
    let items: [PlaylistItem]
    let onTap: (PlaylistItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title.isEmpty ? "Uncategorized" : title)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(items.count)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) {
                    ForEach(items.prefix(30)) { item in
                        Button { onTap(item) } label: {
                            PosterCard(item: item)
                                .frame(width: 115)
                        }
                        .buttonStyle(.plain)
                    }
                    if items.count > 30 {
                        VStack {
                            Text("+\(items.count - 30)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text("more")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        .frame(width: 70, height: 165)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

// MARK: - Series Show Rail (grouped at show level)

struct SeriesShowRail: View {
    let title: String
    let items: [PlaylistItem]
    let onTap: (PlaylistItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title.isEmpty ? "Uncategorized" : title)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(items.count) episodes")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) {
                    ForEach(items.prefix(30)) { item in
                        Button { onTap(item) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                PosterCard(item: item)
                                    .frame(width: 115)
                                Text(item.name)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .frame(width: 115, alignment: .leading)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    if items.count > 30 {
                        VStack {
                            Text("+\(items.count - 30)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        .frame(width: 70, height: 165)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

// MARK: - Channel Row (compact live-TV row)

struct ChannelRow: View {
    let item: PlaylistItem

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let logoURL = item.resolvedLogoURL {
                    CachedAsyncImage(url: logoURL) {
                        channelFallback
                    }
                    .aspectRatio(contentMode: .fill)
                } else {
                    channelFallback
                }
            }
            .frame(width: 36, height: 36)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if let group = item.groupTitle {
                    Text(group)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            if item.isLive {
                Text("LIVE")
                    .font(.system(size: 8, weight: .heavy))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 3))
            }

            Image(systemName: "play.fill")
                .font(.system(size: 11))
                .foregroundStyle(.red)
                .frame(width: 28, height: 28)
                .background(.red.opacity(0.1))
                .clipShape(Circle())
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var channelFallback: some View {
        Image(systemName: "tv.fill")
            .font(.system(size: 14))
            .foregroundStyle(.secondary)
            .frame(width: 36, height: 36)
    }
}

// MARK: - Shared Components

struct ItemButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.white.opacity(0.05) : .clear)
    }
}

struct TabPill: View {
    let title: String
    let icon: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(title)
                    .font(.caption.weight(.medium))
                if count > 0 {
                    Text(count.abbreviated)
                        .font(.system(size: 9, weight: .bold))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(isSelected ? .white.opacity(0.2) : Color(.systemGray5))
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(isSelected ? .red : Color(.systemGray6))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Grouped items model

struct GroupedItems: Identifiable {
    let id: String
    let name: String
    var items: [PlaylistItem]

    init(name: String, items: [PlaylistItem]) {
        self.id = name
        self.name = name
        self.items = items
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
    @Published var groupedItems: [GroupedItems] = []
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

    /// Main entry point — routes to appropriate loading strategy
    func loadContent() async {
        page = 1
        isLoading = true
        items = []
        groupedItems = []

        switch selectedTab {
        case .categories:
            do { categories = try await DataService.shared.fetchCategories(playlistId: playlist.id) } catch {}
        case .movie, .series:
            if searchText.isEmpty {
                await loadGrouped(contentType: selectedTab == .movie ? .movie : .series)
            } else {
                await loadFlat()
            }
        default:
            await loadFlat()
        }

        isLoading = false
    }

    /// Flat item list (channels, all, search results)
    private func loadFlat() async {
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
    }

    /// Grouped loading for movies/series — fetch all items, group by group_title client-side
    private func loadGrouped(contentType: ContentType) async {
        do {
            // Fetch a large batch for grouping (limit 500 for initial view)
            let response = try await DataService.shared.fetchItems(
                playlistId: playlist.id,
                contentType: contentType,
                page: 1,
                limit: 500
            )

            // Group by group_title
            var groups: [String: [PlaylistItem]] = [:]
            for item in response.items {
                let key = item.groupTitle ?? ""
                groups[key, default: []].append(item)
            }

            // Sort groups: largest first, items alphabetically within
            groupedItems = groups
                .map { GroupedItems(name: $0.key, items: $0.value.sorted { $0.name < $1.name }) }
                .sorted { $0.items.count > $1.items.count }

            hasMore = response.page < response.totalPages
        } catch {}
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
                limit: selectedTab == .movie || selectedTab == .series ? 500 : 50
            )
            if selectedTab == .movie || selectedTab == .series, searchText.isEmpty {
                // Append to groups
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

    // Legacy name kept for API compat
    func loadItems() async { await loadContent() }

    func debounceSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await loadContent()
        }
    }

    func scan() async {
        isScanning = true
        do {
            try await DataService.shared.scanPlaylist(id: playlist.id)
            await loadContent()
        } catch {}
        isScanning = false
    }

    func currentChannelContext(for item: PlaylistItem) -> [PlaylistItem]? {
        guard item.contentType == .channel else { return nil }
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
