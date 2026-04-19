import SwiftUI

// MARK: - Playlist info from browse API

struct BrowsePlaylistInfo: Codable, Identifiable {
    let id: String
    let name: String
    let channels_count: Int
}

// MARK: - Live TV Browser — playlist-first IPTV navigation

struct LiveTVView: View {
    @StateObject private var vm = LiveTVViewModel()
    @State private var selectedItem: PlaylistItem?

    var body: some View {
        NavigationStack {
            Group {
                if vm.playlistsLoading {
                    playlistLoadingSkeleton
                } else if vm.playlists.isEmpty || vm.playlistsError != nil {
                    noPlaylistsState
                } else if vm.activePlaylist == nil {
                    playlistPickerPhase
                } else if let cat = vm.activeCategory {
                    channelListPhase(cat)
                } else if vm.isSearching {
                    searchResultsView
                } else {
                    categoryGridPhase
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if vm.activeCategory == nil {
                    ToolbarItem(placement: .principal) {
                        HStack(spacing: 6) {
                            Image(systemName: "tv.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.red)
                            Text("Live TV")
                                .font(.headline)
                        }
                    }
                }
                // Playlist switcher in toolbar (when browsing channels)
                if vm.activePlaylist != nil && vm.playlists.count > 1 {
                    ToolbarItem(placement: .topBarTrailing) {
                        playlistSwitcherMenu
                    }
                }
            }
            .fullScreenCover(item: $selectedItem) { item in
                PlayerView(
                    item: item,
                    channelList: vm.currentChannelList
                )
            }
            .task { await vm.loadPlaylists() }
        }
    }

    // MARK: - Phase 0: Playlist Loading

    private var playlistLoadingSkeleton: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 40)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemGray6))
                    .frame(height: 72)
                    .shimmering()
            }
            .padding(.horizontal, 16)
            Spacer()
        }
    }

    private var noPlaylistsState: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(.quaternary)
            Text(vm.playlistsError ?? "No active playlists")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            if vm.playlistsError != nil {
                Button("Retry") {
                    Task { await vm.loadPlaylists() }
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(.red)
            } else {
                Text("Add a playlist to start watching Live TV")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
        }
    }

    // MARK: - Phase 1: Playlist Picker

    private var playlistPickerPhase: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header
                VStack(spacing: 8) {
                    Image(systemName: "list.bullet.rectangle.portrait.fill")
                        .font(.system(size: 36, weight: .light))
                        .foregroundStyle(.red.opacity(0.7))
                    Text("Select a Playlist")
                        .font(.title3.weight(.bold))
                    Text("Choose which playlist to browse.\nChannels are scoped to your selection.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 24)

                // Playlist cards
                VStack(spacing: 10) {
                    ForEach(vm.playlists) { p in
                        Button {
                            withAnimation(.easeInOut(duration: 0.25)) {
                                vm.selectPlaylist(p)
                            }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "tv.fill")
                                    .font(.system(size: 18))
                                    .foregroundStyle(.red)
                                    .frame(width: 44, height: 44)
                                    .background(.red.opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.name)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Text("\(p.channels_count) channels")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(14)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Playlist Switcher Menu

    private var playlistSwitcherMenu: some View {
        Menu {
            ForEach(vm.playlists) { p in
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        vm.selectPlaylist(p)
                    }
                } label: {
                    Label {
                        Text(p.name)
                        Text("\(p.channels_count) ch")
                    } icon: {
                        if p.id == vm.activePlaylist?.id {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "list.bullet")
                    .font(.system(size: 11))
                Text(vm.activePlaylist?.name ?? "")
                    .font(.caption2.weight(.medium))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .bold))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Color(.systemGray6))
            .clipShape(Capsule())
        }
    }

    // MARK: - Phase 2: Category Grid (playlist selected)

    private var categoryGridPhase: some View {
        VStack(spacing: 0) {
            // Search bar scoped to playlist
            searchBar(text: $vm.globalSearch, placeholder: "Search in \(vm.activePlaylist?.name ?? "channels")...")
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

            if vm.isLoading {
                loadingSkeleton
            } else if vm.categories.isEmpty {
                emptyState
            } else {
                ScrollView {
                    // Stats
                    HStack(spacing: 4) {
                        Image(systemName: "square.grid.2x2")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                        Text("\(vm.totalChannels) channels · \(vm.categories.count) categories")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)

                    // Category tiles
                    LazyVGrid(
                        columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                        spacing: 12
                    ) {
                        ForEach(vm.categories) { cat in
                            CategoryTile(category: cat) {
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    vm.activeCategory = cat
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 40)
                }
            }
        }
    }

    // MARK: - Phase 2: Channel List

    private func channelListPhase(_ category: LiveTVCategory) -> some View {
        VStack(spacing: 0) {
            // Sticky header
            VStack(spacing: 10) {
                // Back + title
                HStack(spacing: 10) {
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            vm.activeCategory = nil
                            vm.channelSearch = ""
                            vm.activeGroup = nil
                        }
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.primary)
                            .frame(width: 32, height: 32)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    Text(category.icon)
                        .font(.title2)

                    Text(category.label)
                        .font(.headline)
                        .lineLimit(1)

                    Text("\(vm.displayItems.count)")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(.systemGray5))
                        .clipShape(Capsule())

                    Spacer()
                }
                .padding(.horizontal, 16)

                // In-category search
                searchBar(text: $vm.channelSearch, placeholder: "Search in \(category.label)...")
                    .padding(.horizontal, 16)

                // Sub-group pills
                if category.groups.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            GroupPill(name: "All", count: category.totalCount, isSelected: vm.activeGroup == nil) {
                                vm.activeGroup = nil
                            }
                            ForEach(category.groups, id: \.name) { group in
                                GroupPill(
                                    name: group.name,
                                    count: group.items.count,
                                    isSelected: vm.activeGroup == group.name
                                ) {
                                    vm.activeGroup = vm.activeGroup == group.name ? nil : group.name
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
            .padding(.vertical, 10)
            .background(.bar)

            Divider()

            // Channel list
            if vm.displayItems.isEmpty {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(.quaternary)
                    Text("No channels found")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if !vm.channelSearch.isEmpty {
                        Button("Clear search") {
                            vm.channelSearch = ""
                        }
                        .font(.caption)
                        .foregroundStyle(.red)
                    }
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(vm.displayItems) { item in
                            Button {
                                vm.currentChannelList = vm.displayItems
                                selectedItem = item
                            } label: {
                                LiveChannelRow(
                                    item: item,
                                    isActive: item.id == selectedItem?.id
                                )
                            }
                            .buttonStyle(ChannelButtonStyle())

                            if item.id != vm.displayItems.last?.id {
                                Divider().padding(.leading, 60)
                            }
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
        }
    }

    // MARK: - Global Search Results

    private var searchResultsView: some View {
        VStack(spacing: 0) {
            searchBar(text: $vm.globalSearch, placeholder: "Search in \(vm.activePlaylist?.name ?? "channels")...")
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

            Divider()

            if vm.searchResults.isEmpty {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(.quaternary)
                    Text("No channels match \"\(vm.globalSearch)\"")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            } else {
                HStack {
                    Text("\(vm.searchResults.count) channels found")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(vm.searchResults) { item in
                            Button {
                                vm.currentChannelList = vm.searchResults
                                selectedItem = item
                            } label: {
                                LiveChannelRow(item: item, isActive: item.id == selectedItem?.id)
                            }
                            .buttonStyle(ChannelButtonStyle())

                            if item.id != vm.searchResults.last?.id {
                                Divider().padding(.leading, 60)
                            }
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
        }
    }

    // MARK: - Shared Components

    private func searchBar(text: Binding<String>, placeholder: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            TextField(placeholder, text: text)
                .font(.subheadline)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !text.wrappedValue.isEmpty {
                Button {
                    text.wrappedValue = ""
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
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var loadingSkeleton: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
            spacing: 12
        ) {
            ForEach(0..<6, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemGray6))
                    .frame(height: 130)
                    .shimmering()
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(.quaternary)
            Text("No channels available")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            Text("Add a playlist to get started")
                .font(.caption)
                .foregroundStyle(.tertiary)
            Spacer()
        }
    }
}

// MARK: - Category Tile

private struct CategoryTile: View {
    let category: LiveTVCategory
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 8) {
                // Icon + count
                HStack {
                    Text(category.icon)
                        .font(.system(size: 28))
                    Spacer()
                    Text("\(category.totalCount)")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color(.systemGray5))
                        .clipShape(Capsule())
                }

                // Label
                Text(category.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                // Group count
                Text("\(category.groups.count) \(category.groups.count == 1 ? "group" : "groups")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                // Preview logos
                if !category.previewLogos.isEmpty {
                    HStack(spacing: 3) {
                        ForEach(category.previewLogos.prefix(4), id: \.self) { url in
                            AsyncImage(url: url) { phase in
                                switch phase {
                                case .success(let image):
                                    image.resizable().aspectRatio(contentMode: .fit)
                                default:
                                    Color(.systemGray5)
                                }
                            }
                            .frame(width: 22, height: 22)
                            .clipShape(RoundedRectangle(cornerRadius: 5))
                        }
                        if category.totalCount > 4 {
                            Text("+\(category.totalCount - 4)")
                                .font(.system(size: 9))
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Group Pill

private struct GroupPill: View {
    let name: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(name)
                    .lineLimit(1)
                Text("\(count)")
                    .foregroundStyle(isSelected ? .white.opacity(0.6) : .secondary)
            }
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(isSelected ? Color.primary : Color(.systemGray6))
            .foregroundStyle(isSelected ? Color(.systemBackground) : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Live Channel Row

private struct LiveChannelRow: View {
    let item: PlaylistItem
    let isActive: Bool

    var body: some View {
        HStack(spacing: 10) {
            // Logo
            Group {
                if let logoURL = item.resolvedLogoURL {
                    AsyncImage(url: logoURL) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fit)
                        default:
                            logoFallback
                        }
                    }
                } else {
                    logoFallback
                }
            }
            .frame(width: 36, height: 36)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(isActive ? Color.red.opacity(0.4) : .clear, lineWidth: 1.5)
            )

            // Name
            Text(item.name)
                .font(.subheadline)
                .foregroundStyle(isActive ? .red : .primary)
                .lineLimit(1)

            Spacer(minLength: 4)

            // Active indicator or play button
            if isActive {
                HStack(spacing: 2) {
                    ForEach(0..<3, id: \.self) { i in
                        Capsule()
                            .fill(Color.red)
                            .frame(width: 3, height: CGFloat([10, 14, 8][i]))
                    }
                }
                .frame(width: 16)
            } else {
                Image(systemName: "play.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.red)
                    .frame(width: 26, height: 26)
                    .background(.red.opacity(0.1))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(isActive ? Color.red.opacity(0.05) : .clear)
    }

    private var logoFallback: some View {
        Image(systemName: "tv.fill")
            .font(.system(size: 14))
            .foregroundStyle(.secondary)
            .frame(width: 36, height: 36)
    }
}

private struct ChannelButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.white.opacity(0.05) : .clear)
    }
}

// MARK: - Shimmer modifier

private struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    colors: [.clear, .white.opacity(0.08), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .offset(x: phase * 200)
                .onAppear {
                    withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                        phase = 1
                    }
                }
            )
            .clipped()
    }
}

private extension View {
    func shimmering() -> some View { modifier(ShimmerModifier()) }
}

// MARK: - Category model

struct LiveTVCategory: Identifiable {
    let id: String
    let key: String
    let label: String
    let icon: String
    let groups: [ChannelGroup]
    let totalCount: Int
    let previewLogos: [URL]

    struct ChannelGroup {
        let name: String
        let items: [PlaylistItem]
    }
}

// MARK: - Smart category classification

private struct CategoryDef {
    let key: String
    let label: String
    let icon: String
    let pattern: NSRegularExpression
}

private let categoryDefs: [CategoryDef] = {
    func rx(_ pattern: String) -> NSRegularExpression {
        try! NSRegularExpression(pattern: pattern, options: .caseInsensitive)
    }
    return [
        CategoryDef(key: "sports",        label: "Sports",        icon: "⚽", pattern: rx("sport|bein|sky\\s?sport|espn|dazn|fox\\s?sport|eurosport|eleven|supersport|arena\\s?sport")),
        CategoryDef(key: "news",          label: "News",          icon: "📰", pattern: rx("news|cnn|bbc|al\\s?jazeera|sky\\s?news|france\\s?24|euronews|cnbc|bloomberg|rt\\b|dw\\b|trt\\s?world")),
        CategoryDef(key: "kids",          label: "Kids",          icon: "🧸", pattern: rx("kid|cartoon|nickelodeon|nick\\b|disney|baby|junior|tiji|gulli|boomerang|cneto|spacetoon|karusel")),
        CategoryDef(key: "movies",        label: "Cinema",        icon: "🎬", pattern: rx("movie|cinema|film|hbo|showtime|starz|paramount|amc\\b|tcm\\b|cinemax")),
        CategoryDef(key: "music",         label: "Music",         icon: "🎵", pattern: rx("music|mtv|vh1|trace|melody|muzz|rotana\\s?(music|clip)|radio")),
        CategoryDef(key: "documentary",   label: "Documentary",   icon: "🌍", pattern: rx("document|discovery|nat\\s?geo|national\\s?geo|history|animal\\s?planet|science|planet\\s?earth|bbc\\s?earth|love\\s?nature")),
        CategoryDef(key: "arabic",        label: "Arabic",        icon: "🌙", pattern: rx("arab|mbc\\b|rotana|lbc\\b|ldc\\b|al[\\s-]|abu\\s?dhabi|dubai|qatar|kuwait|oman|jordan|iraq|syria|lebanon|egypt|tunisia|morocco|algeria|libya|sudan|yemen|saudi|bahrain")),
        CategoryDef(key: "religious",     label: "Religious",     icon: "🕌", pattern: rx("relig|quran|islam|christian|church|gospel|prayer|bible|catholic|faith|iqra|kanal\\s?7|trt\\s?diyanet|huda")),
        CategoryDef(key: "turkish",       label: "Turkish",       icon: "🇹🇷", pattern: rx("turk|trt\\b|kanal\\s?d|star\\s?tv|atv\\b|show\\s?tv|fox\\s?tv.*tr|teve2|tv8|beyaz")),
        CategoryDef(key: "french",        label: "French",        icon: "🇫🇷", pattern: rx("franc|tf1|france\\s?\\d|m6\\b|canal\\+|arte|bfm|lci|rmc|c8\\b|cstar|w9\\b|nrj")),
        CategoryDef(key: "german",        label: "German",        icon: "🇩🇪", pattern: rx("german|deutsch|ard\\b|zdf\\b|rtl\\b|sat\\.?1|pro\\s?7|vox\\b|kabel|n-tv|ntv|welt|phoenix|3sat|arte.*de")),
        CategoryDef(key: "english",       label: "English",       icon: "🇬🇧", pattern: rx("\\b(uk|british|england)\\b|bbc\\s?(one|two|three|four)|itv\\b|channel\\s?(4|5)|sky\\s?(one|atlantic|cinema)|dave\\b|e4\\b")),
        CategoryDef(key: "spanish",       label: "Spanish",       icon: "🇪🇸", pattern: rx("spain|spanish|espanol|tve\\b|antena\\s?3|telecinco|la\\s?sexta|cuatro\\b|movistar|gol\\b|barca")),
        CategoryDef(key: "indian",        label: "Indian",        icon: "🇮🇳", pattern: rx("india|hindi|tamil|telugu|star\\s?(plus|gold|bharat)|zee\\b|sony.*tv|colors|ndtv|aaj\\s?tak")),
        CategoryDef(key: "entertainment", label: "Entertainment", icon: "🎭", pattern: rx("entertain|general|variety|comedy|drama|lifestyle|tlc|bravo|e!\\b|fx\\b")),
    ]
}()

private func classifyGroup(_ name: String) -> String {
    let range = NSRange(name.startIndex..., in: name)
    for def in categoryDefs {
        if def.pattern.firstMatch(in: name, range: range) != nil {
            return def.key
        }
    }
    return "other"
}

// MARK: - ViewModel (playlist-first)

@MainActor
final class LiveTVViewModel: ObservableObject {
    // Playlist state
    @Published var playlists: [BrowsePlaylistInfo] = []
    @Published var playlistsLoading = true
    @Published var playlistsError: String?
    @Published var activePlaylist: BrowsePlaylistInfo?

    // Channel state (scoped to selected playlist)
    @Published var categories: [LiveTVCategory] = []
    @Published var isLoading = false
    @Published var totalChannels = 0
    @Published var globalSearch = ""
    @Published var channelSearch = ""
    @Published var activeCategory: LiveTVCategory?
    @Published var activeGroup: String?
    @Published var currentChannelList: [PlaylistItem] = []

    private var allSections: [BrowseSection] = []
    private var allChannels: [PlaylistItem] = []

    var isSearching: Bool { !globalSearch.trimmingCharacters(in: .whitespaces).isEmpty }

    // Channels shown in the active category
    var displayItems: [PlaylistItem] {
        guard let cat = activeCategory else { return [] }

        var items: [PlaylistItem]
        if let g = activeGroup, let group = cat.groups.first(where: { $0.name == g }) {
            items = group.items
        } else {
            items = cat.groups.flatMap(\.items)
        }

        if !channelSearch.trimmingCharacters(in: .whitespaces).isEmpty {
            let q = channelSearch.lowercased()
            items = items.filter {
                $0.name.lowercased().contains(q) ||
                ($0.groupTitle?.lowercased().contains(q) ?? false)
            }
        }

        return items
    }

    // Global search results (scoped to selected playlist's channels)
    var searchResults: [PlaylistItem] {
        guard isSearching else { return [] }
        let q = globalSearch.lowercased()
        return allChannels.filter {
            $0.name.lowercased().contains(q) ||
            ($0.groupTitle?.lowercased().contains(q) ?? false)
        }
    }

    // Phase 1: Load playlists
    func loadPlaylists() async {
        playlistsLoading = true
        playlistsError = nil
        defer { playlistsLoading = false }

        do {
            let token = try await SupabaseManager.shared.client.auth.session.accessToken

            var components = URLComponents(url: AppConfig.webAppBaseURL, resolvingAgainstBaseURL: false)!
            components.path = "/api/browse"
            components.queryItems = [URLQueryItem(name: "mode", value: "playlists")]

            var request = URLRequest(url: components.url!)
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode < 300 else {
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode == 401 || statusCode == 307 {
                    playlistsError = "Session expired. Please sign in again."
                } else {
                    playlistsError = "Failed to load playlists."
                }
                return
            }

            struct PlaylistsResponse: Codable {
                let playlists: [BrowsePlaylistInfo]
            }
            let decoded = try JSONDecoder().decode(PlaylistsResponse.self, from: data)
            self.playlists = decoded.playlists

            // Auto-select if only one playlist
            if decoded.playlists.count == 1 {
                selectPlaylist(decoded.playlists[0])
            }
        } catch {
            playlistsError = "Network error: \(error.localizedDescription)"
        }
    }

    // Select a playlist and load its channels
    func selectPlaylist(_ playlist: BrowsePlaylistInfo) {
        activePlaylist = playlist
        // Reset channel state
        categories = []
        allSections = []
        allChannels = []
        totalChannels = 0
        activeCategory = nil
        activeGroup = nil
        globalSearch = ""
        channelSearch = ""

        Task { await loadChannels(playlistId: playlist.id) }
    }

    // Phase 2: Load channels scoped to a playlist
    private func loadChannels(playlistId: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let sections = try await fetchGroupedChannels(playlistId: playlistId)
            self.allSections = sections
            self.allChannels = sections.flatMap(\.items)
            self.totalChannels = allChannels.count
            self.categories = buildCategories(from: sections)
        } catch {
            // Silent — empty state shown
        }
    }

    private func fetchGroupedChannels(playlistId: String) async throws -> [BrowseSection] {
        let token = try await SupabaseManager.shared.client.auth.session.accessToken

        var components = URLComponents(url: AppConfig.webAppBaseURL, resolvingAgainstBaseURL: false)!
        components.path = "/api/browse"
        components.queryItems = [
            URLQueryItem(name: "type", value: "channel"),
            URLQueryItem(name: "mode", value: "grouped"),
            URLQueryItem(name: "playlist_id", value: playlistId),
        ]

        var request = URLRequest(url: components.url!)
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode < 300 else {
            throw NSError(domain: "LiveTV", code: 1)
        }

        let decoded = try JSONDecoder.supabase.decode(BrowseGroupedResponse.self, from: data)
        return decoded.sections
    }

    private func buildCategories(from sections: [BrowseSection]) -> [LiveTVCategory] {
        var buckets: [String: (def: CategoryDef?, groups: [String: [PlaylistItem]])] = [:]

        for section in sections {
            let key = classifyGroup(section.name)
            if buckets[key] == nil {
                buckets[key] = (
                    def: categoryDefs.first(where: { $0.key == key }),
                    groups: [:]
                )
            }
            var existing = buckets[key]!.groups[section.name] ?? []
            existing.append(contentsOf: section.items)
            buckets[key]!.groups[section.name] = existing
        }

        var result: [LiveTVCategory] = []
        for (key, bucket) in buckets {
            let groups = bucket.groups
                .map { LiveTVCategory.ChannelGroup(name: $0.key, items: $0.value) }
                .sorted { $0.items.count > $1.items.count }
            let total = groups.reduce(0) { $0 + $1.items.count }

            var logos: [URL] = []
            outer: for g in groups {
                for item in g.items {
                    if let url = item.resolvedLogoURL {
                        logos.append(url)
                        if logos.count >= 4 { break outer }
                    }
                }
            }

            result.append(LiveTVCategory(
                id: key,
                key: key,
                label: bucket.def?.label ?? "Other",
                icon: bucket.def?.icon ?? "📺",
                groups: groups,
                totalCount: total,
                previewLogos: logos
            ))
        }

        return result.sorted { $0.totalCount > $1.totalCount }
    }
}

// MARK: - API response types

private struct BrowseGroupedResponse: Codable {
    let sections: [BrowseSection]
    let total: Int
    let groupCount: Int
}

private struct BrowseSection: Codable {
    let name: String
    let items: [PlaylistItem]
    let count: Int
}
