import SwiftUI
import AVKit
import AVFoundation

// MARK: - Playlist info from browse API

struct BrowsePlaylistInfo: Codable, Identifiable {
    let id: String
    let name: String
    let channels_count: Int
}

// MARK: - Live TV — Real IPTV Architecture
//
// Layout (after playlist selection):
//   ┌──────────────────────────────────┐
//   │  Inline Player (16:9)            │  ← Video area, tap for controls
//   │  Channel Name · Group            │
//   ├──────────────────────────────────┤
//   │ ⚽Sports │📰News │🧸Kids │ ...  │  ← Category tabs (scroll)
//   ├──────────────────────────────────┤
//   │ [All] [Bein] [Sky Sport] [ESPN]  │  ← Sub-group pills (optional)
//   ├──────────────────────────────────┤
//   │  Channel list (scrollable)       │  ← Tap to play, active highlighted
//   └──────────────────────────────────┘

struct LiveTVView: View {
    @StateObject private var vm = LiveTVViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if vm.playlistsLoading {
                    playlistLoadingSkeleton
                } else if vm.playlists.isEmpty || vm.playlistsError != nil {
                    noPlaylistsState
                } else if vm.activePlaylist == nil {
                    playlistPickerPhase
                } else {
                    iptvBrowser
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 6) {
                        Image(systemName: "tv.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.red)
                        Text("Live TV")
                            .font(.headline)
                    }
                }
                if vm.activePlaylist != nil && vm.playlists.count > 1 {
                    ToolbarItem(placement: .topBarTrailing) {
                        playlistSwitcherMenu
                    }
                }
            }
            .task { await vm.loadPlaylists() }
        }
        .fullScreenCover(isPresented: $vm.showFullscreen, onDismiss: {
            vm.reclaimPlayerAfterFullscreen()
        }) {
            if let item = vm.playingItem, let player = vm.inlinePlayer {
                PlayerView(item: item, channelList: nil, existingPlayer: player)
            }
        }
    }

    // MARK: - Phase 0: Loading skeleton

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
                Button("Retry") { Task { await vm.loadPlaylists() } }
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
                VStack(spacing: 8) {
                    Image(systemName: "list.bullet.rectangle.portrait.fill")
                        .font(.system(size: 36, weight: .light))
                        .foregroundStyle(.red.opacity(0.7))
                    Text("Select a Playlist")
                        .font(.title3.weight(.bold))
                    Text("Choose which playlist to browse.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 24)

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

    // MARK: - Playlist Switcher

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

    // MARK: - Phase 2: IPTV Browser (inline player + categories + channels)

    private var iptvBrowser: some View {
        VStack(spacing: 0) {
            if vm.isLoading {
                loadingSkeleton
            } else if vm.categories.isEmpty {
                emptyState
            } else {
                // Inline player area
                inlinePlayerArea

                // Search bar
                searchBar
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                // Global search results or browsing UI
                if vm.isSearching {
                    searchResultsList
                } else {
                    // Category tabs
                    categoryTabs

                    // Sub-group pills (when active category has multiple groups)
                    if let cat = vm.activeCategory, cat.groups.count > 1 {
                        subGroupPills(cat)
                    }

                    Divider()
                        .padding(.top, 4)

                    // Channel list
                    channelList
                }
            }
        }
    }

    // MARK: - Inline Player Area

    private var inlinePlayerArea: some View {
        ZStack {
            Color.black

            if let player = vm.inlinePlayer {
                VideoSurface(player: player)
                    .transition(.opacity)

                // Buffering
                if vm.playerBuffering {
                    ProgressView()
                        .scaleEffect(1.1)
                        .tint(.white)
                }

                // Error
                if let err = vm.playerError {
                    VStack(spacing: 8) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.system(size: 20, weight: .light))
                            .foregroundStyle(.white.opacity(0.4))
                        Text(err)
                            .font(.caption2)
                            .foregroundStyle(.white.opacity(0.5))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                        Button("Retry") { vm.retryCurrentChannel() }
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 5)
                            .background(.red, in: Capsule())
                    }
                    .padding(12)
                }

                // Controls overlay on tap
                if vm.showPlayerControls {
                    playerControlsOverlay
                        .transition(.opacity)
                }
            } else {
                // No channel selected yet
                VStack(spacing: 8) {
                    Image(systemName: "play.tv.fill")
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(.white.opacity(0.2))
                    Text("Select a channel")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.3))
                }
            }

            // Now-playing info bar at bottom
            if vm.playingItem != nil {
                VStack {
                    Spacer()
                    nowPlayingBar
                }
            }
        }
        .aspectRatio(16/9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 0))
        .onTapGesture(count: 2) {
            if vm.playingItem != nil {
                vm.openFullscreen()
            }
        }
        .onTapGesture {
            if vm.playingItem != nil {
                vm.togglePlayerControls()
            }
        }
    }

    private var nowPlayingBar: some View {
        HStack(spacing: 8) {
            if vm.playingItem != nil {
                Circle().fill(.red).frame(width: 6, height: 6)
                    .shadow(color: .red.opacity(0.5), radius: 3)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(vm.playingItem?.name ?? "")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let group = vm.playingItem?.groupTitle {
                    Text(group)
                        .font(.system(size: 9))
                        .foregroundStyle(.white.opacity(0.4))
                        .lineLimit(1)
                }
            }
            Spacer()
            if vm.inlinePlayer != nil {
                Button {
                    vm.togglePlayPause()
                } label: {
                    Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(.white.opacity(0.15), in: Circle())
                }

                // Fullscreen button
                Button {
                    vm.openFullscreen()
                } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(.white.opacity(0.15), in: Circle())
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
        )
    }

    private var playerControlsOverlay: some View {
        VStack {
            // Top row — fullscreen button
            HStack {
                Spacer()
                Button { vm.openFullscreen() } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .padding(12)
            }

            Spacer()

            // Center row — prev/play/next
            HStack(spacing: 32) {
                Button { vm.playPrevChannel() } label: {
                    Image(systemName: "backward.end.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(vm.hasPrevChannel ? .white : .white.opacity(0.2))
                }
                .disabled(!vm.hasPrevChannel)

                Button { vm.togglePlayPause() } label: {
                    Image(systemName: vm.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(.white)
                }

                Button { vm.playNextChannel() } label: {
                    Image(systemName: "forward.end.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(vm.hasNextChannel ? .white : .white.opacity(0.2))
                }
                .disabled(!vm.hasNextChannel)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.4))
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            TextField("Search channels...", text: $vm.searchQuery)
                .font(.subheadline)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !vm.searchQuery.isEmpty {
                Button {
                    vm.searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Category Tabs

    private var categoryTabs: some View {
        let sortedCats = vm.categories.sorted { a, b in
            let sA = BrowsingMemory.shared.categoryScore(a.key)
            let sB = BrowsingMemory.shared.categoryScore(b.key)
            if sA != sB { return sA > sB }
            return a.totalCount > b.totalCount
        }

        return ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(sortedCats) { cat in
                        let isSelected = vm.activeCategory?.id == cat.id
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                vm.selectCategory(cat)
                            }
                        } label: {
                            HStack(spacing: 5) {
                                Text(cat.icon)
                                    .font(.system(size: 14))
                                Text(cat.label)
                                    .font(.caption.weight(isSelected ? .bold : .medium))
                                Text("\(cat.totalCount)")
                                    .font(.system(size: 9, weight: .medium))
                                    .foregroundStyle(isSelected ? .white.opacity(0.6) : .secondary)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(isSelected ? Color.red : Color(.systemGray6))
                            .foregroundStyle(isSelected ? .white : .primary)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .id(cat.id)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }
            .onChange(of: vm.activeCategory?.id) { _, newId in
                if let id = newId {
                    withAnimation { proxy.scrollTo(id, anchor: .center) }
                }
            }
        }
    }

    // MARK: - Sub-Group Pills

    private func subGroupPills(_ category: LiveTVCategory) -> some View {
        let sortedGroups = category.groups.sorted { a, b in
            let scoreA = BrowsingMemory.shared.groupScore(category: category.key, group: a.name)
            let scoreB = BrowsingMemory.shared.groupScore(category: category.key, group: b.name)
            if scoreA != scoreB { return scoreA > scoreB }
            return a.items.count > b.items.count
        }

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 5) {
                // Favorites pill (only when there are favorites)
                if !vm.favoriteItems.isEmpty {
                    IPTVPill(
                        name: "❤️ Favorites",
                        count: vm.favoriteItems.count,
                        isSelected: vm.showFavorites
                    ) {
                        vm.showFavorites.toggle()
                        if vm.showFavorites { vm.activeGroup = nil }
                    }
                }

                IPTVPill(
                    name: "All",
                    count: category.totalCount,
                    isSelected: vm.activeGroup == nil && !vm.showFavorites
                ) {
                    vm.showFavorites = false
                    vm.selectGroup(nil)
                }

                ForEach(sortedGroups) { group in
                    IPTVPill(
                        name: group.displayName,
                        count: group.items.count,
                        isSelected: vm.activeGroup == group.name && !vm.showFavorites
                    ) {
                        vm.showFavorites = false
                        vm.selectGroup(group.name)
                    }
                }
            }
            .padding(.horizontal, 12)
        }
    }

    // MARK: - Channel List

    private var channelList: some View {
        let items = vm.showFavorites ? vm.favoriteItems : vm.displayItems
        return Group {
            if items.isEmpty {
                VStack(spacing: 10) {
                    Spacer()
                    Image(systemName: vm.showFavorites ? "heart.slash" : "tv.slash")
                        .font(.system(size: 24, weight: .light))
                        .foregroundStyle(.quaternary)
                    Text(vm.showFavorites ? "No favorites yet" : "No channels in this group")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if vm.showFavorites {
                        Text("Tap ❤️ on channels to add them here")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    Spacer()
                }
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(items) { item in
                                IPTVChannelRow(
                                    item: item,
                                    isPlaying: item.id == vm.playingItem?.id,
                                    healthStatus: vm.channelHealth(for: item),
                                    isFavorite: vm.isFavorite(item),
                                    onFavorite: { vm.toggleFavorite(item) }
                                ) {
                                    vm.playChannel(item)
                                }
                                .id(item.id)

                                if item.id != items.last?.id {
                                    Divider().padding(.leading, 56)
                                }
                            }
                        }
                        .padding(.bottom, 80)
                    }
                    .onChange(of: vm.playingItem?.id) { _, newId in
                        if let id = newId {
                            withAnimation(.easeInOut(duration: 0.3)) {
                                proxy.scrollTo(id, anchor: .center)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Search Results

    private var searchResultsList: some View {
        Group {
            if vm.searchResults.isEmpty {
                VStack(spacing: 10) {
                    Spacer()
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 24, weight: .light))
                        .foregroundStyle(.quaternary)
                    Text("No channels match \"\(vm.searchQuery)\"")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            } else {
                VStack(spacing: 0) {
                    HStack {
                        Text("\(vm.searchResults.count) results")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)

                    Divider()

                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(vm.searchResults) { item in
                                IPTVChannelRow(
                                    item: item,
                                    isPlaying: item.id == vm.playingItem?.id,
                                    healthStatus: vm.channelHealth(for: item),
                                    isFavorite: vm.isFavorite(item),
                                    onFavorite: { vm.toggleFavorite(item) }
                                ) {
                                    vm.playChannel(item)
                                }

                                if item.id != vm.searchResults.last?.id {
                                    Divider().padding(.leading, 56)
                                }
                            }
                        }
                        .padding(.bottom, 80)
                    }
                }
            }
        }
    }

    // MARK: - Shared

    private var loadingSkeleton: some View {
        VStack(spacing: 0) {
            // Fake player area
            Color(.systemGray6)
                .aspectRatio(16/9, contentMode: .fit)
                .shimmering()

            // Fake tabs
            HStack(spacing: 6) {
                ForEach(0..<5, id: \.self) { _ in
                    Capsule().fill(Color(.systemGray6)).frame(width: 70, height: 28).shimmering()
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            // Fake rows
            ForEach(0..<6, id: \.self) { _ in
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 8).fill(Color(.systemGray6)).frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: 4) {
                        RoundedRectangle(cornerRadius: 4).fill(Color(.systemGray6)).frame(width: 140, height: 12)
                        RoundedRectangle(cornerRadius: 4).fill(Color(.systemGray6)).frame(width: 80, height: 10)
                    }
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .shimmering()
            }
            Spacer()
        }
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
            Spacer()
        }
    }
}

// MARK: - IPTV Channel Row

private struct IPTVChannelRow: View {
    let item: PlaylistItem
    let isPlaying: Bool
    let healthStatus: ChannelHealthManager.ChannelStatus
    var isFavorite: Bool = false
    var onFavorite: (() -> Void)? = nil
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onTap) {
                HStack(spacing: 10) {
                    // Channel logo with health dot overlay
                    Group {
                        if let logoURL = item.resolvedLogoURL {
                            CachedAsyncImage(url: logoURL) {
                                logoFallback
                            }
                            .aspectRatio(contentMode: .fit)
                        } else {
                            logoFallback
                        }
                    }
                    .frame(width: 38, height: 38)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(isPlaying ? Color.red.opacity(0.5) : .clear, lineWidth: 1.5)
                    )
                    .overlay(alignment: .bottomTrailing) {
                        // Health status dot
                        if healthStatus != .unknown {
                            Circle()
                                .fill(healthStatus == .working ? Color.green : Color.red.opacity(0.7))
                                .frame(width: 8, height: 8)
                                .overlay(
                                    Circle().stroke(Color(.systemBackground), lineWidth: 1.5)
                                )
                                .offset(x: 2, y: 2)
                        }
                    }

                    // Channel info
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text(item.name)
                                .font(.subheadline.weight(isPlaying ? .semibold : .regular))
                                .foregroundStyle(isPlaying ? .red : healthStatus == .failed ? .secondary : .primary)
                                .lineLimit(1)
                        }
                        if let group = item.groupTitle {
                            Text(group)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 4)

                    // Playing indicator or play icon
                    if isPlaying {
                        HStack(spacing: 2) {
                            ForEach(0..<3, id: \.self) { i in
                                Capsule()
                                    .fill(Color.red)
                                    .frame(width: 3, height: CGFloat([10, 15, 8][i]))
                            }
                        }
                        .frame(width: 18)
                    } else {
                        Image(systemName: healthStatus == .failed ? "xmark.circle" : "play.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(healthStatus == .failed ? .red.opacity(0.4) : .secondary)
                            .frame(width: 26, height: 26)
                            .background(Color(.systemGray6))
                            .clipShape(Circle())
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(IPTVRowButtonStyle())

            // Favorite heart button
            if let onFav = onFavorite {
                Button(action: onFav) {
                    Image(systemName: isFavorite ? "heart.fill" : "heart")
                        .font(.system(size: 14))
                        .foregroundStyle(isFavorite ? Color.red : Color(.tertiaryLabel))
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(isPlaying ? Color.red.opacity(0.06) : .clear)
        .opacity(healthStatus == .failed ? 0.6 : 1.0)
    }

    private var logoFallback: some View {
        Image(systemName: "tv.fill")
            .font(.system(size: 14))
            .foregroundStyle(.quaternary)
            .frame(width: 38, height: 38)
    }
}

private struct IPTVRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color(.systemGray6).opacity(0.5) : .clear)
    }
}

// MARK: - IPTV Pill (sub-group)

private struct IPTVPill: View {
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
                    .foregroundStyle(isSelected ? Color.white.opacity(0.5) : Color.gray.opacity(0.5))
            }
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(isSelected ? Color(.label) : Color(.systemGray6))
            .foregroundStyle(isSelected ? Color(.systemBackground) : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
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

    struct ChannelGroup: Identifiable {
        var id: String { name }
        let name: String
        let displayName: String
        let items: [PlaylistItem]
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Advanced IPTV Category Classifier
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct CategoryDef {
    let key: String
    let label: String
    let icon: String
    let pattern: NSRegularExpression
}

/// Robust IPTV group-title classification with smart prefix extraction.
///
/// IPTV group_titles commonly use patterns like:
///   "US | Sports HD"    "DE: Nachrichten"    "FR - Cinema"    "AR ║ MBC"
///
/// The classifier:
///   1. Strips country/language prefixes (2–3 letter ISO codes)
///   2. Matches the cleaned suffix against 30+ content categories
///   3. Falls back to matching the full group_title
///   4. Uses channel NAME as a last-resort signal
///   5. Only falls back to "Other" when nothing works

// ── Prefix extraction ──

/// Matches common IPTV prefixes: "US | ", "DE: ", "FR - ", "AR ║ ", "UK│", etc.
private let prefixRegex = try! NSRegularExpression(
    pattern: #"^([A-Z]{2,3})\s*[\|\-:│║·/\\]\s*"#,
    options: .caseInsensitive
)

/// Known country/language codes that appear as IPTV prefixes
private let knownCountryCodes: Set<String> = [
    "us", "uk", "gb", "ca", "au", "nz",                               // English-speaking
    "de", "at", "ch",                                                  // German-speaking
    "fr", "be",                                                        // French-speaking
    "es", "mx", "ar", "cl", "co", "pe", "ve",                         // Spanish
    "pt", "br",                                                        // Portuguese
    "it",                                                              // Italian
    "nl",                                                              // Dutch
    "pl",                                                              // Polish
    "ro",                                                              // Romanian
    "tr",                                                              // Turkish
    "in", "pk", "bd",                                                  // South Asian
    "sa", "ae", "kw", "qa", "bh", "om", "iq", "jo", "lb", "sy",      // Arabic
    "eg", "ma", "dz", "tn", "ly", "sd", "ye", "ps", "mr",              // North African/Arabic + Palestine, Mauritania
    "so", "dj", "km",                                                  // Somalia, Djibouti, Comoros (Arabic-speaking)
    "ru", "ua", "by", "kz",                                           // Russian-speaking
    "se", "no", "dk", "fi",                                           // Scandinavian
    "gr", "cy",                                                        // Greek
    "rs", "hr", "ba", "mk", "si", "me", "bg", "al", "xk",            // Balkan
    "ir", "af",                                                        // Persian
    "kr", "jp", "cn", "tw", "hk", "ph", "th", "vn", "id", "my",      // Asian
    "ng", "gh", "ke", "za", "et", "tz", "cm",                         // African
    "il",                                                              // Hebrew
    "cu", "do", "ec", "py", "uy", "bo", "cr", "pa", "gt", "hn",      // Latin America
]

/// Strip a known country prefix from a group_title and return (prefix, rest).
/// E.g. "US | Sports HD" → ("us", "Sports HD"),  "Sports" → (nil, "Sports")
private func extractPrefix(_ raw: String) -> (code: String?, rest: String) {
    let nsRange = NSRange(raw.startIndex..., in: raw)
    if let match = prefixRegex.firstMatch(in: raw, range: nsRange),
       let codeRange = Range(match.range(at: 1), in: raw) {
        let code = String(raw[codeRange]).lowercased()
        if knownCountryCodes.contains(code) {
            let afterPrefix = String(raw[raw.index(raw.startIndex, offsetBy: match.range.length)...])
                .trimmingCharacters(in: .whitespaces)
            return (code, afterPrefix.isEmpty ? raw : afterPrefix)
        }
    }
    return (nil, raw)
}

// ── Category definitions (30+ patterns) ──

private let categoryDefs: [CategoryDef] = {
    func rx(_ p: String) -> NSRegularExpression {
        try! NSRegularExpression(pattern: p, options: .caseInsensitive)
    }
    return [
        // Content-type categories
        CategoryDef(key: "sports",       label: "Sports",       icon: "⚽", pattern: rx(#"sport|bein|sky\s?sport|espn|dazn|fox\s?sport|eurosport|eleven|supersport|arena\s?sport|nfl|nba|mlb|nhl|ufc|wwe|boxing|tennis|golf|f1\b|formula|bundesliga|premier\s?league|la\s?liga|serie\s?a|ligue\s?1|futbol|football|soccer|cricket|rugby"#)),
        CategoryDef(key: "news",         label: "News",         icon: "📰", pattern: rx(#"news|nachrichten|noticias|actualit|cnn|bbc\s?news|al\s?jazeera|sky\s?news|france\s?24|euronews|cnbc|bloomberg|rt\b|dw\b|trt\s?world|fox\s?news|msnbc|n-tv|ntv|welt\b|bfm|lci|tagesschau|ard\s?aktuell|info\b.*kanal|kanal\b.*info"#)),
        CategoryDef(key: "kids",         label: "Kids",         icon: "🧸", pattern: rx(#"kid|child|cartoon|nickelodeon|nick\b|disney|baby|junior|tiji|gulli|boomerang|cneto|spacetoon|karusel|kinder|enfant|jim\s?jam|duck\s?tv|lala|bumble|toon|animat"#)),
        CategoryDef(key: "movies",       label: "Cinema",       icon: "🎬", pattern: rx(#"movie|cinema|film|hbo|showtime|starz|paramount|amc\b|tcm\b|cinemax|kino\b|cine\b|pelicul|netflix|prime\s?video|hallmark|lifetime"#)),
        CategoryDef(key: "music",        label: "Music",        icon: "🎵", pattern: rx(#"music|musik|musique|mtv\b|vh1|trace|melody|muzz|rotana\s?(music|clip)|radio|hit\s?(tv|music)|club\b.*tv|ibiza|deluxe\s?music|viva\b"#)),
        CategoryDef(key: "documentary",  label: "Documentary",  icon: "🌍", pattern: rx(#"document|discovery|nat\s?geo|national\s?geo|history|animal\s?planet|science|planet\s?earth|bbc\s?earth|love\s?nature|doku|natuur|wildlife|travel|adventure|explore"#)),
        CategoryDef(key: "religious",    label: "Religious",    icon: "🕌", pattern: rx(#"relig|quran|islam|muslim|mosque|ramadan|iqra|kanal\s?7|trt\s?diyanet|huda|masjid"#)),
        CategoryDef(key: "christian",    label: "Christian",    icon: "✝️", pattern: rx(#"christian|church|gospel|prayer|bible|catholic|faith|god\s?tv|daystar|ewtn|tbn\b|cbn\b|ctv\b|worship|hillsong|bethel|joel\s?osteen|trinity|bless|salvation|preach|ministry|pastoral|devotion|hymn|praise|jesus|christ|divine|miracle|angel|holy|spiritual|apostol|evangel|risen|redeemer|pentecost"#)),
        CategoryDef(key: "entertainment",label: "Entertainment",icon: "🎭", pattern: rx(#"entertain|general|variety|comedy|drama|lifestyle|reality|tlc|bravo|e!\b|fx\b|usa\s?network|tbs|tnt\b|food|cooking|cuisine|hgtv|diy\b"#)),
        CategoryDef(key: "education",    label: "Education",    icon: "📚", pattern: rx(#"educat|learn|school|university|lecture|class|wissen|ted\b|pbs\b|knowledge"#)),
        CategoryDef(key: "adult",        label: "18+",          icon: "🔞", pattern: rx(#"adult|18\+|xxx|eroti|playboy|hustle"#)),

        // Country / language categories
        CategoryDef(key: "arabic",       label: "Arabic",       icon: "🪬", pattern: rx(#"arab|mbc\b|rotana|lbc\b|ldc\b|al[\s\-]|abu\s?dhabi|dubai\b|qatar|kuwait|oman|jordan|iraq|syria|leban|egypt|tunis|morocco|maroc|algeri|libya|sudan|yemen|saudi|bahrain|mashreq|maghreb|nile\s?sat|beur|شبكة|عربي"#)),
        CategoryDef(key: "turkish",      label: "Turkish",      icon: "🇹🇷", pattern: rx(#"turk|türk|trt\b|kanal\s?d|star\s?tv|atv\b|show\s?tv|fox\s?tv.*tr|teve2|tv8\b|beyaz|habert|cnn\s?turk|s\s?tv\b"#)),
        CategoryDef(key: "french",       label: "French",       icon: "🇫🇷", pattern: rx(#"franc|fran[çc]|tf1|france\s?\d|m6\b|canal\s?\+|arte\s?(fr)?|bfm|lci|rmc|c8\b|cstar|w9\b|nrj|tmcfr|chérie|planète"#)),
        CategoryDef(key: "german",       label: "German",       icon: "🇩🇪", pattern: rx(#"german|deutsch|ard\b|zdf\b|rtl\b|sat\.?1|pro\s?7|vox\b|kabel|n-tv|ntv\b|welt\b|phoenix|3sat|arte\s?de|servus|orf\b|srf\b|swiss"#)),
        CategoryDef(key: "english_uk",   label: "UK",           icon: "🇬🇧", pattern: rx(#"\b(uk|british|england)\b|bbc\s?(one|two|three|four)|itv\b|channel\s?(4|5)|sky\s?(one|atlantic|cinema)|dave\b|e4\b|film4|more4|quest"#)),
        CategoryDef(key: "english_us",   label: "USA",          icon: "🇺🇸", pattern: rx(#"\b(usa|america|us\s?tv)\b|abc\b|nbc\b|cbs\b|fox\b(?!.*tr)|pbs\b|hulu|peacock|bet\b|cw\b|freeform"#)),
        CategoryDef(key: "spanish",      label: "Spanish",      icon: "🇪🇸", pattern: rx(#"spain|spanish|español|espanol|tve\b|antena\s?3|telecinco|la\s?sexta|cuatro\b|movistar|gol\b|barca|univision|telemundo|televisa|atreseries|dmax.*es"#)),
        CategoryDef(key: "portuguese",   label: "Portuguese",   icon: "🇵🇹", pattern: rx(#"portug|brasil|brazil|rtp\b|sic\b|tvi\b|globo|band\b|record\b|benfica|sporting|porto\s?canal|cmtv|interv"#)),
        CategoryDef(key: "italian",      label: "Italian",      icon: "🇮🇹", pattern: rx(#"ital|rai\s?\d|rai\b|mediaset|canale\s?5|italia\s?1|rete\s?4|la7\b|sky\s?it|dmax.*it|focus|premium\s?(cinema|sport)|real\s?time"#)),
        CategoryDef(key: "dutch",        label: "Dutch",        icon: "🇳🇱", pattern: rx(#"dutch|nederland|npo\b|rtl\s?(4|5|7|8)|sbs\s?6|net\s?5|veronica|vtm\b|een\b|canvas"#)),
        CategoryDef(key: "polish",       label: "Polish",       icon: "🇵🇱", pattern: rx(#"pol(ish|ska|and)|tvp\b|tvn\b|polsat|tv\s?puls|canal\s?\+.*pl|eleven.*pl|superstacja"#)),
        CategoryDef(key: "romanian",     label: "Romanian",     icon: "🇷🇴", pattern: rx(#"roman|antena\s?(1|3)|pro\s?tv|kanal\s?d.*ro|digi\b|tvr\b|prima\s?tv|look\s?tv|dolce"#)),
        CategoryDef(key: "indian",       label: "Indian",       icon: "🇮🇳", pattern: rx(#"india|hindi|tamil|telugu|malayalam|kannada|marathi|bengali|punjabi|star\s?(plus|gold|bharat)|zee\b|sony.*tv|colors|ndtv|aaj\s?tak|sun\s?tv|gemini|maa\s?tv"#)),
        CategoryDef(key: "russian",      label: "Russian",      icon: "🇷🇺", pattern: rx(#"russ|росс|первый|россия|матч|нтв|рен|тнт|стс|домашний|пятница|звезда|мир\b|rtR\b"#)),
        CategoryDef(key: "balkan",       label: "Balkan",       icon: "🏔️", pattern: rx(#"balkan|serb|croat|bosn|macedon|sloven|montenegr|albani|kosovo|rtv\s?(bih|srbija)|hrt\b|nova\s?tv.*hr|rts\b|pink\b|happy\s?tv|vizion|klan"#)),
        CategoryDef(key: "greek",        label: "Greek",        icon: "🇬🇷", pattern: rx(#"greek|greece|ελλ|mega\b.*gr|ant1|alpha\s?tv|skai|star\s?tv.*gr|ert\b|open\s?tv"#)),
        CategoryDef(key: "scandinavian", label: "Nordic",       icon: "🇸🇪", pattern: rx(#"scandinav|nordic|svt\b|tv4\b.*se|nrk\b|tv2\b.*(no|dk)|dr\b.*dk|yle\b|finland|sweden|norway|denmark|viasat|nent"#)),
        CategoryDef(key: "african",      label: "African",      icon: "🌍", pattern: rx(#"afri(ca|que)|nigeria|ghana|kenya|ethiopia|south\s?africa|cameroon|congo|senegal|cote\s?d|ivory|dstv|gotv|startimes|nollywood|afro"#)),
        CategoryDef(key: "asian",        label: "Asian",        icon: "🌏", pattern: rx(#"asian|korea|japan|chin(a|ese)|taiwan|filipino|thai|vietnam|malaysia|indonesia|nhk\b|kbs\b|sbs\b.*kr|tvb\b|astro\b|gma\b|abs.?cbn"#)),
        CategoryDef(key: "persian",      label: "Persian",      icon: "🇮🇷", pattern: rx(#"persian|iran|farsi|من\s?و\s?تو|gem\s?tv|manoto|irib|press\s?tv"#)),
        CategoryDef(key: "kurdish",      label: "Kurdish",      icon: "☀️", pattern: rx(#"kurd|rudaw|kurdistan|nrt\b|payam"#)),
    ]
}()

/// Map a country-code prefix to a category key.
private let countryToCategory: [String: String] = {
    var m: [String: String] = [:]
    // English
    for c in ["us"] { m[c] = "english_us" }
    for c in ["uk", "gb", "au", "nz", "ca"] { m[c] = "english_uk" }
    // German
    for c in ["de", "at", "ch"] { m[c] = "german" }
    // French
    for c in ["fr", "be"] { m[c] = "french" }
    // Spanish
    for c in ["es", "mx", "cl", "co", "pe", "ve", "cu", "do", "ec", "py", "uy", "bo", "cr", "pa", "gt", "hn"] { m[c] = "spanish" }
    // Portuguese
    for c in ["pt", "br"] { m[c] = "portuguese" }
    // Italian
    m["it"] = "italian"
    // Dutch
    m["nl"] = "dutch"
    // Polish
    m["pl"] = "polish"
    // Romanian
    m["ro"] = "romanian"
    // Turkish
    m["tr"] = "turkish"
    // Arabic (note: "ar" is ISO for Argentina in some contexts, but in IPTV it's almost always Arabic)
    for c in ["ar", "sa", "ae", "kw", "qa", "bh", "om", "iq", "jo", "lb", "sy", "eg", "ma", "dz", "tn", "ly", "sd", "ye", "ps", "mr", "so", "dj", "km"] { m[c] = "arabic" }
    // Indian
    for c in ["in", "pk", "bd"] { m[c] = "indian" }
    // Russian
    for c in ["ru", "ua", "by", "kz"] { m[c] = "russian" }
    // Scandinavian
    for c in ["se", "no", "dk", "fi"] { m[c] = "scandinavian" }
    // Greek
    for c in ["gr", "cy"] { m[c] = "greek" }
    // Balkan
    for c in ["rs", "hr", "ba", "mk", "si", "me", "bg", "al", "xk"] { m[c] = "balkan" }
    // Persian
    for c in ["ir", "af"] { m[c] = "persian" }
    // Asian
    for c in ["kr", "jp", "cn", "tw", "hk", "ph", "th", "vn", "id", "my"] { m[c] = "asian" }
    // African
    for c in ["ng", "gh", "ke", "za", "et", "tz", "cm"] { m[c] = "african" }
    // Hebrew
    m["il"] = "entertainment" // group with general content
    return m
}()

// ── Arabic Country Sub-Classification ──

private struct ArabicCountryDef {
    let key: String
    let label: String
    let flag: String
    let codes: Set<String>
    let pattern: NSRegularExpression
}

private let arabicCountryDefs: [ArabicCountryDef] = {
    func rx(_ p: String) -> NSRegularExpression {
        try! NSRegularExpression(pattern: p, options: .caseInsensitive)
    }
    return [
        // Gulf
        ArabicCountryDef(key: "sa", label: "Saudi Arabia", flag: "🇸🇦", codes: ["sa", "ksa"], pattern: rx(#"saudi|ksa\b|sbc\b|ssc\b|riyadh|jeddah|mecca|medina|السعودية|المملكة|الرياض|جدة|مكة|المدينة"#)),
        ArabicCountryDef(key: "ae", label: "UAE", flag: "🇦🇪", codes: ["ae", "uae"], pattern: rx(#"uae\b|emirat|abu\s?dhabi|dubai|sharjah|ajman|fujairah|ras\s?al\s?khaimah|الإمارات|ابو\s?ظبي|دبي|الشارقة"#)),
        ArabicCountryDef(key: "qa", label: "Qatar", flag: "🇶🇦", codes: ["qa", "qat"], pattern: rx(#"qatar|al\s?kass|alkass|bein|be\s?in|الجزيرة|قطر|الكاس|الكأس"#)),
        ArabicCountryDef(key: "kw", label: "Kuwait", flag: "🇰🇼", codes: ["kw", "kuw"], pattern: rx(#"kuwait|ktv\b|funoon|scope|الكويت"#)),
        ArabicCountryDef(key: "bh", label: "Bahrain", flag: "🇧🇭", codes: ["bh", "bhr"], pattern: rx(#"bahrain|البحرين"#)),
        ArabicCountryDef(key: "om", label: "Oman", flag: "🇴🇲", codes: ["om", "omn"], pattern: rx(#"\boman\b|muscat|عمان|مسقط|السلطنة"#)),
        // Mashreq
        ArabicCountryDef(key: "iq", label: "Iraq", flag: "🇮🇶", codes: ["iq", "irq"], pattern: rx(#"iraq|iraqi|iraqia|baghdad|basra|العراق|عراقي|بغداد|البصرة"#)),
        ArabicCountryDef(key: "sy", label: "Syria", flag: "🇸🇾", codes: ["sy", "syr"], pattern: rx(#"syria|syrian|damascus|aleppo|سوريا|سوري|دمشق|حلب"#)),
        ArabicCountryDef(key: "lb", label: "Lebanon", flag: "🇱🇧", codes: ["lb", "lbn"], pattern: rx(#"leban|lbc\b|otv\b|tele\s?liban|لبنان|لبناني|بيروت"#)),
        ArabicCountryDef(key: "jo", label: "Jordan", flag: "🇯🇴", codes: ["jo", "jor"], pattern: rx(#"jordan|amman|roya|الأردن|اردن|أردني|عمّ?ان"#)),
        ArabicCountryDef(key: "ps", label: "Palestine", flag: "🇵🇸", codes: ["ps", "pse", "pal"], pattern: rx(#"palestin|gaza|ramallah|فلسطين|غزة|القدس|رام\s?الله"#)),
        ArabicCountryDef(key: "ye", label: "Yemen", flag: "🇾🇪", codes: ["ye", "yem"], pattern: rx(#"yemen|sanaa|aden|اليمن|يمني|صنعاء|عدن"#)),
        // North Africa
        ArabicCountryDef(key: "eg", label: "Egypt", flag: "🇪🇬", codes: ["eg", "egy"], pattern: rx(#"egypt|misr|cairo|nile|cbc\b|dmc\b|onn?\b|النهار|مصر|مصري|القاهرة|النيل"#)),
        ArabicCountryDef(key: "dz", label: "Algeria", flag: "🇩🇿", codes: ["dz", "dza", "alg"], pattern: rx(#"alger|algeri|dzair|entv|echourouk|ennahar|الجزائر|جزائري"#)),
        ArabicCountryDef(key: "ma", label: "Morocco", flag: "🇲🇦", codes: ["ma", "mar", "mor"], pattern: rx(#"morocc|maroc|tele\s?maroc|2m\b|snrt|medi\s?1|المغرب|مغربي"#)),
        ArabicCountryDef(key: "tn", label: "Tunisia", flag: "🇹🇳", codes: ["tn", "tun"], pattern: rx(#"tunisia|tunis|tunisna|nessma|watania|تونس|تونسي"#)),
        ArabicCountryDef(key: "ly", label: "Libya", flag: "🇱🇾", codes: ["ly", "lby", "lib"], pattern: rx(#"libya|tripoli|benghazi|ليبيا|ليبي|طرابلس|بنغازي"#)),
        ArabicCountryDef(key: "sd", label: "Sudan", flag: "🇸🇩", codes: ["sd", "sdn"], pattern: rx(#"sudan|khartoum|السودان|سوداني|الخرطوم|خرطوم"#)),
        ArabicCountryDef(key: "mr", label: "Mauritania", flag: "🇲🇷", codes: ["mr", "mrt"], pattern: rx(#"mauritan|nouakchott|موريتان|موريتانيا|نواكشوط"#)),
        // Additional Arab League states seen in some providers
        ArabicCountryDef(key: "so", label: "Somalia", flag: "🇸🇴", codes: ["so", "som"], pattern: rx(#"somalia|mogadishu|الصومال|صومالي"#)),
        ArabicCountryDef(key: "dj", label: "Djibouti", flag: "🇩🇯", codes: ["dj", "dji"], pattern: rx(#"djibouti|جيبوتي"#)),
        ArabicCountryDef(key: "km", label: "Comoros", flag: "🇰🇲", codes: ["km", "com"], pattern: rx(#"comoros|القمر|جزر\s?القمر"#)),
        // Thematic Arabic sub-categories
        ArabicCountryDef(key: "ar_islamic", label: "Islamic", flag: "🕌", codes: [], pattern: rx(#"islam|islamic|quran|iqra|huda\s?tv|azhar|إسلام|اسلام|قرآن|قران|إقرأ|اقرأ|هدى|الأزهر"#)),
        ArabicCountryDef(key: "ar_christian", label: "Christian", flag: "✝️", codes: [], pattern: rx(#"christ|coptic|church|gospel|evangel|jesus|مسيح|مسيحية|قبط|كنيسة|إنجيل|انجيل"#)),
        ArabicCountryDef(key: "ar_religious", label: "Religious", flag: "🕊️", codes: [], pattern: rx(#"relig|faith|worship|دعوي|دينية|روحاني|روحي"#)),
    ]
}()

/// Country code → Arabic country key (built from country definitions)
private let arabicCountryCodeMap: [String: String] = {
    var map: [String: String] = ["ar": "ar_pan"]
    for def in arabicCountryDefs {
        for code in def.codes {
            map[code] = def.key
        }
    }
    return map
}()

/// Arabic-country codes and aliases used for high-priority routing.
private let arabicCountryCodes: Set<String> = Set(arabicCountryCodeMap.keys)

private let arabicScriptRegex = try! NSRegularExpression(
    pattern: #"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]"#,
    options: []
)

private let arabicBroadSignalRegex = try! NSRegularExpression(
    pattern: #"arab|mbc\b|rotana|osn\b|be\s?in|jazeera|alkass|islam|quran|christ|egypt|misr|saudi|ksa\b|uae\b|kuwait|qatar|bahrain|oman|iraq|syria|leban|jordan|palestin|yemen|alger|morocc|maroc|tunisia|libya|sudan|mauritan|somalia|djibouti|comoros|عرب|مصر|السعود|الإمارات|الامارات|الكويت|قطر|البحرين|عمان|العراق|سوريا|لبنان|الأردن|فلسطين|اليمن|الجزائر|المغرب|تونس|ليبيا|السودان|موريتان"#,
    options: .caseInsensitive
)

private let panArabicRegex = try! NSRegularExpression(
    pattern: #"\b(arab|pan\s?arab|middle\s?east|mena|mbc|rotana|osn)\b|عرب|العربية"#,
    options: .caseInsensitive
)

private let metadataCountryRegex = try! NSRegularExpression(
    pattern: #"(?:tvg-country|country)\s*=\s*\"?([A-Za-z]{2,3})\"?"#,
    options: .caseInsensitive
)

private func normalizeArabicText(_ text: String) -> String {
    var s = text
        .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        .lowercased()
    let replacements: [(String, String)] = [
        ("أ", "ا"), ("إ", "ا"), ("آ", "ا"),
        ("ى", "ي"), ("ؤ", "و"), ("ئ", "ي"),
        ("ة", "ه"), ("ـ", " "),
    ]
    for (from, to) in replacements {
        s = s.replacingOccurrences(of: from, with: to)
    }
    s = s.replacingOccurrences(of: "_", with: " ")
    return s
}

private func regexMatches(_ regex: NSRegularExpression, in text: String) -> Bool {
    let range = NSRange(text.startIndex..., in: text)
    return regex.firstMatch(in: text, range: range) != nil
}

private func extractCountryCodeFromTvgId(_ tvgId: String?) -> String? {
    guard let tvgId, let dot = tvgId.lastIndex(of: ".") else { return nil }
    let code = String(tvgId[tvgId.index(after: dot)...]).lowercased()
    return (2...3).contains(code.count) ? code : nil
}

private func metadataRaw(_ item: PlaylistItem) -> String {
    (item.metadata?["raw"]?.value as? String) ?? ""
}

private func extractCountryCodesFromMetadata(_ item: PlaylistItem) -> [String] {
    let raw = metadataRaw(item)
    guard !raw.isEmpty else { return [] }
    let range = NSRange(raw.startIndex..., in: raw)
    return metadataCountryRegex.matches(in: raw, range: range).compactMap { match in
        guard let codeRange = Range(match.range(at: 1), in: raw) else { return nil }
        return String(raw[codeRange]).lowercased()
    }
}

private func detectArabicCountryKey(item: PlaylistItem, sectionName: String) -> String? {
    let (sectionPrefix, sectionRest) = extractPrefix(sectionName)
    let (groupPrefix, groupRest) = extractPrefix(item.groupTitle ?? "")

    let codeHints = [
        sectionPrefix,
        groupPrefix,
        extractCountryCodeFromTvgId(item.tvgId),
    ].compactMap { $0 } + extractCountryCodesFromMetadata(item)

    for code in codeHints {
        if let mapped = arabicCountryCodeMap[code] {
            return mapped
        }
    }

    let probeParts = [
        sectionName,
        sectionRest,
        item.groupTitle ?? "",
        groupRest,
        item.name,
        item.tvgName ?? "",
        item.tvgId ?? "",
        metadataRaw(item),
    ]
    let probe = probeParts.joined(separator: " ")
    let normalized = normalizeArabicText(probe)

    let hasArabicScript = regexMatches(arabicScriptRegex, in: probe)
    let hasBroadArabicSignal = regexMatches(arabicBroadSignalRegex, in: normalized)
    guard hasArabicScript || hasBroadArabicSignal else { return nil }

    for def in arabicCountryDefs where !def.key.hasPrefix("ar_") {
        if regexMatches(def.pattern, in: normalized) {
            return def.key
        }
    }

    if let def = arabicCountryDefs.first(where: { $0.key == "ar_christian" }), regexMatches(def.pattern, in: normalized) {
        return "ar_christian"
    }
    if let def = arabicCountryDefs.first(where: { $0.key == "ar_islamic" }), regexMatches(def.pattern, in: normalized) {
        return "ar_islamic"
    }
    if let def = arabicCountryDefs.first(where: { $0.key == "ar_religious" }), regexMatches(def.pattern, in: normalized) {
        return "ar_religious"
    }

    if regexMatches(panArabicRegex, in: normalized) {
        return "ar_pan"
    }
    return hasArabicScript ? "ar_general" : "ar_pan"
}

private func arabicCountryDisplayName(for key: String) -> String {
    switch key {
    case "ar_pan":
        return "🌍 Pan-Arab"
    case "ar_general":
        return "🪬 Arabic Other"
    default:
        if let def = arabicCountryDefs.first(where: { $0.key == key }) {
            return "\(def.flag) \(def.label)"
        }
        return "🏳️ \(key.uppercased())"
    }
}

/// Smart classification: prefix extraction → content match → country match → channel name fallback
///
/// **Arabic priority rule**: If a group's prefix is a known Arabic country code,
/// it is classified as "arabic" immediately — genre patterns are NOT checked first.
/// This ensures Arabic channels don't leak into Sports, News, Entertainment, etc.
private func classifyGroup(_ groupName: String, channelNames: [String] = []) -> String {
    let (prefix, suffix) = extractPrefix(groupName)
    let normalizedGroup = normalizeArabicText(groupName)

    // 0) ARABIC PRIORITY: If prefix is an Arabic country code, classify as Arabic immediately.
    //    This prevents "SA | Sports" from being classified as "sports" instead of "arabic".
    if let code = prefix, arabicCountryCodes.contains(code) {
        return "arabic"
    }

    // Also catch groups with explicit Arabic text labels (no prefix).
    if arabicGroupPrefixes.contains(where: { normalizedGroup.hasPrefix($0) }) ||
        regexMatches(arabicScriptRegex, in: groupName) ||
        regexMatches(arabicBroadSignalRegex, in: normalizedGroup) {
        return "arabic"
    }

    // Numeric/raw provider groups (e.g. "492") need channel-name heuristics first.
    let compact = normalizedGroup.trimmingCharacters(in: .whitespacesAndNewlines)
    let numericOnly = !compact.isEmpty && compact.allSatisfy { $0.isNumber }
    if numericOnly && !channelNames.isEmpty {
        let sample = Array(channelNames.prefix(10))
        let arabicVotes = sample.filter {
            let normalizedName = normalizeArabicText($0)
            return regexMatches(arabicScriptRegex, in: $0) || regexMatches(arabicBroadSignalRegex, in: normalizedName)
        }.count
        if arabicVotes >= max(2, sample.count / 3) {
            return "arabic"
        }
    }

    // If a significant part of channel samples look Arabic, classify as Arabic.
    if !channelNames.isEmpty {
        let sample = Array(channelNames.prefix(12))
        let arabicVotes = sample.filter {
            let normalizedName = normalizeArabicText($0)
            return regexMatches(arabicScriptRegex, in: $0) || regexMatches(arabicBroadSignalRegex, in: normalizedName)
        }.count
        if arabicVotes >= max(3, sample.count / 2) {
            return "arabic"
        }
    }

    // 1) Try matching the cleaned suffix against category patterns.
    let suffixResult = matchCategoryPatterns(suffix)
    if suffixResult != "other" { return suffixResult }

    // 2) Try matching the full group_title (in case prefix is part of the pattern).
    let fullResult = matchCategoryPatterns(groupName)
    if fullResult != "other" { return fullResult }

    // 3) If we have a known country prefix, use country→category mapping.
    if let code = prefix, let cat = countryToCategory[code] {
        return cat
    }

    // 4) Channel-name heuristics: sample up to 8 names, majority vote.
    if !channelNames.isEmpty {
        var votes: [String: Int] = [:]
        for name in channelNames.prefix(8) {
            let v = matchCategoryPatterns(name)
            if v != "other" {
                votes[v, default: 0] += 1
            }
        }
        if let best = votes.max(by: { $0.value < $1.value }), best.value >= 2 {
            return best.key
        }
    }

    return "other"
}

/// Common group-name prefixes that indicate Arabic content (without a 2-letter code)
private let arabicGroupPrefixes: [String] = [
    "arabic", "arab ", "arab|", "arab-", "arab:",
    "arabe", "عربي", "عرب",
    "ar |", "ar|", "ar -", "ar:",
]

private func matchCategoryPatterns(_ text: String) -> String {
    let range = NSRange(text.startIndex..., in: text)
    for def in categoryDefs {
        if def.pattern.firstMatch(in: text, range: range) != nil {
            return def.key
        }
    }
    return "other"
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - ViewModel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@MainActor
final class LiveTVViewModel: ObservableObject {
    // Playlist state
    @Published var playlists: [BrowsePlaylistInfo] = []
    @Published var playlistsLoading = true
    @Published var playlistsError: String?
    @Published var activePlaylist: BrowsePlaylistInfo?

    // Category / channel state
    @Published var categories: [LiveTVCategory] = []
    @Published var isLoading = false
    @Published var activeCategory: LiveTVCategory?
    @Published var activeGroup: String?
    @Published var searchQuery = ""
    @Published var showFavorites = false

    // Inline player state
    @Published var playingItem: PlaylistItem?
    @Published var inlinePlayer: AVPlayer?
    @Published var isPlaying = false
    @Published var playerBuffering = false
    @Published var playerError: String?
    @Published var showPlayerControls = false

    // Fullscreen
    @Published var showFullscreen = false

    private var allChannels: [PlaylistItem] = []
    private var statusObserver: NSKeyValueObservation?
    private var controlsTimer: Timer?
    private var hasLoadedPlaylists = false
    private var lifecycleObservers: [NSObjectProtocol] = []
    /// Whether inline player was active before background
    private var wasPlayingBeforeBackground = false

    /// Cascade fallback state
    private var fallbackURLs: [URL] = []
    private var fallbackTimer: DispatchWorkItem?

    /// Channel-level auto-fallback state
    private var channelFallbackAttempts = 0
    private static let maxChannelFallbacks = 5  // max channels to try before giving up

    /// Channel health manager
    private let health = ChannelHealthManager.shared

    /// Favorites manager
    let favorites = ChannelFavoritesManager.shared

    /// Browsing memory
    private let memory = BrowsingMemory.shared

    /// In-memory cache: playlistId → (categories, allChannels, timestamp)
    static var channelCache: [String: (categories: [LiveTVCategory], channels: [PlaylistItem], ts: CFAbsoluteTime)] = [:]
    private static let cacheTTL: CFAbsoluteTime = 600 // 10 minutes

    /// Pre-fetched playlists from background preloader
    static var preloadedPlaylists: [BrowsePlaylistInfo]?

    /// Check if channels are cached for a given playlist
    static func hasChannelCache(for playlistId: String) -> Bool {
        guard let cached = channelCache[playlistId] else { return false }
        return CFAbsoluteTimeGetCurrent() - cached.ts < cacheTTL
    }

    /// Store pre-fetched channel data from background preloader
    static func storeChannelCache(playlistId: String, categories: [LiveTVCategory], channels: [PlaylistItem]) {
        channelCache[playlistId] = (categories, channels, CFAbsoluteTimeGetCurrent())
    }

    /// Faster cascade timeout for live TV (4s instead of 6s)
    private static let sourceTimeout: TimeInterval = 4

    var isSearching: Bool { !searchQuery.trimmingCharacters(in: .whitespaces).isEmpty }

    var totalChannels: Int { allChannels.count }

    // Current display items based on selected category + group, sorted by health
    var displayItems: [PlaylistItem] {
        guard let cat = activeCategory else { return [] }

        let raw: [PlaylistItem]
        if let g = activeGroup, let group = cat.groups.first(where: { $0.name == g }) {
            raw = group.items
        } else {
            raw = cat.groups.flatMap(\.items)
        }

        // Smart ordering: working first, unknown middle, failed last
        return raw.sorted { a, b in
            health.sortScore(for: a.resolvedStreamURL) > health.sortScore(for: b.resolvedStreamURL)
        }
    }

    /// Health status for a channel (used by UI)
    func channelHealth(for item: PlaylistItem) -> ChannelHealthManager.ChannelStatus {
        health.status(for: item.resolvedStreamURL)
    }

    var searchResults: [PlaylistItem] {
        guard isSearching else { return [] }
        let q = searchQuery.lowercased()
        return allChannels.filter {
            $0.name.lowercased().contains(q) ||
            ($0.groupTitle?.lowercased().contains(q) ?? false)
        }.sorted { a, b in
            health.sortScore(for: a.resolvedStreamURL) > health.sortScore(for: b.resolvedStreamURL)
        }
    }

    var hasPrevChannel: Bool {
        guard let playing = playingItem else { return false }
        let items = displayItems.isEmpty ? allChannels : displayItems
        guard let idx = items.firstIndex(where: { $0.id == playing.id }) else { return false }
        return idx > 0
    }

    var hasNextChannel: Bool {
        guard let playing = playingItem else { return false }
        let items = displayItems.isEmpty ? allChannels : displayItems
        guard let idx = items.firstIndex(where: { $0.id == playing.id }) else { return false }
        return idx < items.count - 1
    }

    // MARK: - Playlist loading

    func loadPlaylists() async {
        // Skip if already loaded — preserves player, categories, and scroll state
        guard !hasLoadedPlaylists else { return }

        setupLifecycleObservers()

        // Check if background preloader already fetched playlists (instant)
        if let preloaded = Self.preloadedPlaylists, !preloaded.isEmpty {
            self.playlists = preloaded
            self.playlistsLoading = false
            self.hasLoadedPlaylists = true
            if preloaded.count == 1 {
                selectPlaylist(preloaded[0])
            }
            return
        }

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
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                playlistsError = code == 401 || code == 307
                    ? "Session expired. Please sign in again."
                    : "Failed to load playlists."
                return
            }

            struct Resp: Codable { let playlists: [BrowsePlaylistInfo] }
            let decoded = try JSONDecoder().decode(Resp.self, from: data)
            self.playlists = decoded.playlists
            hasLoadedPlaylists = true

            if decoded.playlists.count == 1 {
                selectPlaylist(decoded.playlists[0])
            }
        } catch {
            playlistsError = "Network error: \(error.localizedDescription)"
        }
    }

    func selectPlaylist(_ playlist: BrowsePlaylistInfo) {
        guard playlist.id != activePlaylist?.id else { return }

        // Don't tear down player on playlist switch — keep playback going
        activePlaylist = playlist
        categories = []
        allChannels = []
        activeCategory = nil
        activeGroup = nil
        searchQuery = ""

        Task { await loadChannels(playlistId: playlist.id) }
    }

    // MARK: - Channel loading & classification (with cache)

    private func loadChannels(playlistId: String) async {
        // Check in-memory cache first (instant restore from preload or previous visit)
        if let cached = Self.channelCache[playlistId],
           CFAbsoluteTimeGetCurrent() - cached.ts < Self.cacheTTL {
            self.categories = cached.categories
            self.allChannels = cached.channels
            if let first = categories.first {
                activeCategory = first
            }
            autoPlayFirstChannelIfNeeded()
            return
        }

        isLoading = true

        do {
            let sections = try await fetchGroupedChannels(playlistId: playlistId)
            let channels = sections.flatMap(\.items)

            // Heavy classification — run off main thread
            let categories = await Task.detached(priority: .userInitiated) {
                buildLiveTVCategories(from: sections)
            }.value

            self.allChannels = channels
            self.categories = categories
            isLoading = false

            // Cache the result
            Self.channelCache[playlistId] = (
                categories: categories,
                channels: channels,
                ts: CFAbsoluteTimeGetCurrent()
            )

            if let first = categories.first {
                activeCategory = first
            }
            autoPlayFirstChannelIfNeeded()
        } catch {
            isLoading = false
        }
    }

    /// Auto-play the first channel in the active category if no channel is currently playing
    private func autoPlayFirstChannelIfNeeded() {
        guard playingItem == nil else { return }
        let items = displayItems
        // Prefer a known-working channel, otherwise take first unknown
        if let working = items.first(where: { health.status(for: $0.resolvedStreamURL) == .working }) {
            playChannel(working)
        } else if let first = items.first(where: { !health.isKnownDead($0.resolvedStreamURL) }) {
            playChannel(first)
        } else if let first = items.first {
            playChannel(first)
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

        return try JSONDecoder.supabase.decode(BrowseGroupedResponse.self, from: data).sections
    }

    /// Build categories — delegates to standalone function (can run off main thread)
    private func buildCategories(from sections: [BrowseSection]) -> [LiveTVCategory] {
        buildLiveTVCategories(from: sections)
    }

    // MARK: - Category selection

    func selectCategory(_ cat: LiveTVCategory) {
        activeCategory = cat
        activeGroup = nil
        showFavorites = false
        memory.visitCategory(cat.key)
    }

    func selectGroup(_ groupName: String?) {
        activeGroup = activeGroup == groupName ? nil : groupName
        if let g = groupName, let cat = activeCategory {
            memory.visitGroup(category: cat.key, group: g)
        }
    }

    // MARK: - Favorites

    func toggleFavorite(_ item: PlaylistItem) {
        favorites.toggle(
            streamURL: item.resolvedStreamURL,
            channelName: item.name,
            groupTitle: item.groupTitle,
            logoURL: item.tvgLogo ?? item.logoUrl
        )
        objectWillChange.send()
    }

    func isFavorite(_ item: PlaylistItem) -> Bool {
        favorites.isFavorite(item.resolvedStreamURL)
    }

    /// Channels the user has favorited that exist in the current channel list
    var favoriteItems: [PlaylistItem] {
        let favURLs = favorites.favorites.keys
        return allChannels.filter { favURLs.contains($0.resolvedStreamURL) }
            .sorted { a, b in
                health.sortScore(for: a.resolvedStreamURL) > health.sortScore(for: b.resolvedStreamURL)
            }
    }

    // MARK: - Fullscreen

    func openFullscreen() {
        guard playingItem != nil, inlinePlayer != nil else { return }
        // Hand off the live player to fullscreen — no pause, no re-buffer
        showFullscreen = true
    }

    /// Called when fullscreen cover dismisses — reclaim the shared player for inline use
    func reclaimPlayerAfterFullscreen() {
        guard let player = inlinePlayer else { return }
        // Player is still alive and playing — just ensure we track state
        isPlaying = player.timeControlStatus == .playing
    }

    // MARK: - Inline player

    func playChannel(_ item: PlaylistItem, isAutoFallback: Bool = false) {
        playingItem = item
        playerError = nil
        playerBuffering = true
        showPlayerControls = false
        fallbackTimer?.cancel()
        fallbackURLs = []

        // Reset channel-level fallback counter on manual selection
        if !isAutoFallback {
            channelFallbackAttempts = 0
        }

        let cascade = AppConfig.streamCascade(for: item.resolvedStreamURL)
        guard let first = cascade.first else {
            playerError = "Invalid stream URL"
            playerBuffering = false
            health.markFailed(item.resolvedStreamURL)
            return
        }

        fallbackURLs = Array(cascade.dropFirst())

        // Ensure audio session is active for playback
        try? AVAudioSession.sharedInstance().setActive(true)

        if inlinePlayer == nil {
            let p = AVPlayer()
            p.automaticallyWaitsToMinimizeStalling = false
            inlinePlayer = p
        }

        playStreamURL(first)
    }

    /// Play a single URL through the inline player with status observation
    private func playStreamURL(_ url: URL) {
        let asset = AVURLAsset(url: url, options: [
            "AVURLAssetHTTPHeaderFieldsKey": [
                "User-Agent": "VLC/3.0.21 LibVLC/3.0.21"
            ],
            AVURLAssetPreferPreciseDurationAndTimingKey: false
        ])
        let playerItem = AVPlayerItem(asset: asset)
        playerItem.preferredForwardBufferDuration = 2

        statusObserver?.invalidate()
        fallbackTimer?.cancel()

        statusObserver = playerItem.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch item.status {
                case .readyToPlay:
                    self.playerBuffering = false
                    self.isPlaying = true
                    self.inlinePlayer?.play()
                    self.fallbackTimer?.cancel()
                    self.fallbackURLs = [] // Success — discard remaining fallbacks
                    // Mark channel as working
                    if let stream = self.playingItem?.resolvedStreamURL {
                        self.health.markWorking(stream)
                    }
                    self.channelFallbackAttempts = 0
                case .failed:
                    self.tryNextFallback()
                default:
                    break
                }
            }
        }

        inlinePlayer?.replaceCurrentItem(with: playerItem)
        inlinePlayer?.play()

        // Fallback timeout — shorter for live TV
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor [weak self] in
                self?.tryNextFallback()
            }
        }
        fallbackTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.sourceTimeout, execute: work)
    }

    private func tryNextFallback() {
        fallbackTimer?.cancel()

        guard !fallbackURLs.isEmpty else {
            // All cascade URLs exhausted for this channel
            if inlinePlayer?.currentItem?.status != .readyToPlay {
                // Mark channel as failed
                if let stream = playingItem?.resolvedStreamURL {
                    health.markFailed(stream)
                }
                // Auto-switch to next valid channel
                autoFallbackToNextChannel()
            }
            return
        }

        let next = fallbackURLs.removeFirst()
        playStreamURL(next)
    }

    /// Automatically switch to the next valid channel in the current list
    private func autoFallbackToNextChannel() {
        guard channelFallbackAttempts < Self.maxChannelFallbacks else {
            // Exhausted max attempts — show error
            playerBuffering = false
            playerError = "No working channels found"
            channelFallbackAttempts = 0
            return
        }

        channelFallbackAttempts += 1

        guard let current = playingItem else {
            playerBuffering = false
            playerError = "Stream unavailable"
            return
        }

        let items = displayItems.isEmpty ? allChannels : displayItems
        guard let idx = items.firstIndex(where: { $0.id == current.id }) else {
            playerBuffering = false
            playerError = "Stream unavailable"
            return
        }

        // Search forward for a non-known-dead channel
        let remaining = items[(idx + 1)...]
        if let next = remaining.first(where: { !health.isKnownDead($0.resolvedStreamURL) }) {
            playChannel(next, isAutoFallback: true)
            return
        }

        // Wrap around from start (before current index)
        let before = items[..<idx]
        if let next = before.first(where: { !health.isKnownDead($0.resolvedStreamURL) }) {
            playChannel(next, isAutoFallback: true)
            return
        }

        // Every channel in the list is known dead — stop
        playerBuffering = false
        playerError = "No working channels found"
        channelFallbackAttempts = 0
    }

    func retryCurrentChannel() {
        guard let item = playingItem else { return }
        playChannel(item)
    }

    func togglePlayPause() {
        guard let player = inlinePlayer else { return }
        if isPlaying {
            player.pause()
        } else {
            player.play()
        }
        isPlaying.toggle()
    }

    func togglePlayerControls() {
        showPlayerControls.toggle()
        controlsTimer?.invalidate()
        if showPlayerControls {
            controlsTimer = Timer.scheduledTimer(withTimeInterval: 4, repeats: false) { [weak self] _ in
                Task { @MainActor [weak self] in
                    withAnimation { self?.showPlayerControls = false }
                }
            }
        }
    }

    func playNextChannel() {
        guard let playing = playingItem else { return }
        let items = displayItems.isEmpty ? allChannels : displayItems
        guard let idx = items.firstIndex(where: { $0.id == playing.id }) else { return }
        // Skip known-dead channels when manually navigating
        let remaining = items[(idx + 1)...]
        if let next = remaining.first(where: { !health.isKnownDead($0.resolvedStreamURL) }) {
            playChannel(next)
        } else if let next = remaining.first {
            playChannel(next) // fallback: play next even if dead
        }
    }

    func playPrevChannel() {
        guard let playing = playingItem else { return }
        let items = displayItems.isEmpty ? allChannels : displayItems
        guard let idx = items.firstIndex(where: { $0.id == playing.id }) else { return }
        // Skip known-dead channels when manually navigating
        let before = items[..<idx].reversed()
        if let prev = before.first(where: { !health.isKnownDead($0.resolvedStreamURL) }) {
            playChannel(prev)
        } else if let prev = before.first {
            playChannel(prev) // fallback: play prev even if dead
        }
    }

    private func teardownPlayer() {
        fallbackTimer?.cancel()
        statusObserver?.invalidate()
        controlsTimer?.invalidate()
        inlinePlayer?.pause()
        inlinePlayer?.replaceCurrentItem(with: nil)
        inlinePlayer = nil
        playingItem = nil
        isPlaying = false
        playerBuffering = false
        playerError = nil
        showPlayerControls = false
        removeLifecycleObservers()
    }

    // MARK: - Lifecycle (background/foreground auto-resume)

    private func setupLifecycleObservers() {
        guard lifecycleObservers.isEmpty else { return }

        // Foreground return — re-activate audio and resume inline player
        let fg = NotificationCenter.default.addObserver(
            forName: .appDidBecomeActive, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                try? AVAudioSession.sharedInstance().setActive(true)
                if self.wasPlayingBeforeBackground,
                   let player = self.inlinePlayer,
                   player.currentItem != nil {
                    player.play()
                    self.isPlaying = true
                    self.wasPlayingBeforeBackground = false
                }
            }
        }
        lifecycleObservers.append(fg)

        // Background entry — remember playback state
        let bg = NotificationCenter.default.addObserver(
            forName: .appDidEnterBackground, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.wasPlayingBeforeBackground = self.isPlaying && self.inlinePlayer?.currentItem != nil
            }
        }
        lifecycleObservers.append(bg)

        // AVAudioSession interruption (phone calls, Siri)
        let interrupt = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] notification in
            guard let self,
                  let info = notification.userInfo,
                  let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeValue)
            else { return }
            Task { @MainActor in
                switch type {
                case .began:
                    self.wasPlayingBeforeBackground = self.isPlaying
                case .ended:
                    let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                    let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                    if options.contains(.shouldResume) && self.wasPlayingBeforeBackground {
                        try? AVAudioSession.sharedInstance().setActive(true)
                        self.inlinePlayer?.play()
                        self.isPlaying = true
                    }
                    self.wasPlayingBeforeBackground = false
                @unknown default: break
                }
            }
        }
        lifecycleObservers.append(interrupt)
    }

    private func removeLifecycleObservers() {
        lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
        lifecycleObservers.removeAll()
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Standalone Category Builder (runs off main thread)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// Build categories from sections using smart multi-signal classification.
/// Designed to run off @MainActor (e.g. in Task.detached or background preloader).
private func buildLiveTVCategories(from sections: [BrowseSection]) -> [LiveTVCategory] {
    var buckets: [String: [(sectionName: String, items: [PlaylistItem])]] = [:]

    for section in sections {
        let channelNames = section.items.prefix(8).map(\.name)
        let key = classifyGroup(section.name, channelNames: Array(channelNames))
        buckets[key, default: []].append((section.name, section.items))
    }

    // Try to break up "Other" if disproportionately large
    if let otherBucket = buckets["other"], otherBucket.count > 3 {
        let totalAll = sections.reduce(0) { $0 + $1.items.count }
        let otherCount = otherBucket.reduce(0) { $0 + $1.items.count }

        if Double(otherCount) / Double(max(totalAll, 1)) > 0.4 {
            var stillOther: [(String, [PlaylistItem])] = []
            for (name, items) in otherBucket {
                let allNames = items.map(\.name)
                let deepKey = deepClassifyGroup(groupName: name, channelNames: allNames)
                if deepKey != "other" {
                    buckets[deepKey, default: []].append((name, items))
                } else {
                    stillOther.append((name, items))
                }
            }
            buckets["other"] = stillOther.isEmpty ? nil : stillOther
        }
    }

    // Arabic detection must run at item-level as many providers use numeric/raw group names
    // that hide country information (e.g. "492", "937").
    var arabicBuckets: [String: [PlaylistItem]] = [:]
    var arabicURLs = Set<String>()

    for section in sections {
        for item in section.items {
            guard let key = detectArabicCountryKey(item: item, sectionName: section.name) else { continue }
            if arabicURLs.insert(item.resolvedStreamURL).inserted {
                arabicBuckets[key, default: []].append(item)
            }
        }
    }

    if !arabicURLs.isEmpty {
        // Remove Arabic channels from generic buckets to avoid duplicate rows.
        for key in Array(buckets.keys) {
            let filteredEntries = (buckets[key] ?? []).compactMap { entry -> (sectionName: String, items: [PlaylistItem])? in
                let kept = entry.items.filter { !arabicURLs.contains($0.resolvedStreamURL) }
                return kept.isEmpty ? nil : (entry.sectionName, kept)
            }
            if filteredEntries.isEmpty {
                buckets.removeValue(forKey: key)
            } else {
                buckets[key] = filteredEntries
            }
        }

        var arabicGroups: [LiveTVCategory.ChannelGroup] = arabicBuckets
            .map { countryKey, channels in
                LiveTVCategory.ChannelGroup(
                    name: countryKey,
                    displayName: arabicCountryDisplayName(for: countryKey),
                    items: channels
                )
            }

        // Countries first, then Pan-Arab/thematic groups, with Arabic-other last.
        func rank(_ key: String) -> Int {
            if key == "ar_general" { return 3 }
            if key == "ar_pan" { return 1 }
            if key.hasPrefix("ar_") { return 2 }
            return 0
        }

        arabicGroups.sort {
            let r0 = rank($0.name)
            let r1 = rank($1.name)
            if r0 != r1 { return r0 < r1 }
            if $0.items.count != $1.items.count { return $0.items.count > $1.items.count }
            return $0.displayName < $1.displayName
        }

        let total = arabicGroups.reduce(0) { $0 + $1.items.count }

        var result = buildCategoryList(from: buckets)
        result.append(LiveTVCategory(
            id: "arabic",
            key: "arabic",
            label: "Arabic",
            icon: "🪬",
            groups: arabicGroups,
            totalCount: total
        ))

        return result.sorted {
            if $0.key == "other" { return false }
            if $1.key == "other" { return true }
            return $0.totalCount > $1.totalCount
        }
    }

    return buildCategoryList(from: buckets).sorted {
        if $0.key == "other" { return false }
        if $1.key == "other" { return true }
        return $0.totalCount > $1.totalCount
    }
}

/// Build category list from non-Arabic buckets
private func buildCategoryList(from buckets: [String: [(sectionName: String, items: [PlaylistItem])]]) -> [LiveTVCategory] {
    var result: [LiveTVCategory] = []
    for (key, entries) in buckets {
        let def = categoryDefs.first(where: { $0.key == key })

        let groups: [LiveTVCategory.ChannelGroup] = entries
            .map { entry in
                let (_, cleaned) = extractPrefix(entry.sectionName)
                let displayName = cleaned.isEmpty ? entry.sectionName : cleaned
                return LiveTVCategory.ChannelGroup(
                    name: entry.sectionName,
                    displayName: displayName,
                    items: entry.items
                )
            }
            .sorted { $0.items.count > $1.items.count }

        let total = groups.reduce(0) { $0 + $1.items.count }

        result.append(LiveTVCategory(
            id: key,
            key: key,
            label: def?.label ?? "Other",
            icon: def?.icon ?? "📺",
            groups: groups,
            totalCount: total
        ))
    }
    return result
}

/// Deep classification using majority vote on ALL channel names.
private func deepClassifyGroup(groupName: String, channelNames: [String]) -> String {
    var votes: [String: Int] = [:]
    for name in channelNames {
        let key = matchCategoryPatterns(name)
        if key != "other" { votes[key, default: 0] += 1 }
    }
    let total = channelNames.count
    if let best = votes.max(by: { $0.value < $1.value }),
       Double(best.value) / Double(max(total, 1)) >= 0.3 {
        return best.key
    }
    return "other"
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Background Preloader
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// Pre-warm Live TV data in background. Called from MainTabView.prefetch()
/// so the Live TV tab opens instantly with cached data.
func preloadLiveTVData() async {
    // 1. Fetch playlists
    guard let playlists = try? await fetchLiveTVPlaylists(), !playlists.isEmpty else { return }
    await MainActor.run { LiveTVViewModel.preloadedPlaylists = playlists }

    // 2. Preload channels for the first playlist (most common path)
    let pid = playlists[0].id
    let alreadyCached = await MainActor.run { LiveTVViewModel.hasChannelCache(for: pid) }
    if alreadyCached { return }

    // 3. Fetch channels + classify (all off main thread)
    guard let sections = try? await fetchLiveTVGroupedChannels(playlistId: pid) else { return }
    let channels = sections.flatMap(\.items)
    let categories = buildLiveTVCategories(from: sections)

    // 4. Store in ViewModel's cache
    await MainActor.run {
        LiveTVViewModel.storeChannelCache(playlistId: pid, categories: categories, channels: channels)
    }
}

private func fetchLiveTVPlaylists() async throws -> [BrowsePlaylistInfo] {
    let token = try await SupabaseManager.shared.client.auth.session.accessToken
    var components = URLComponents(url: AppConfig.webAppBaseURL, resolvingAgainstBaseURL: false)!
    components.path = "/api/browse"
    components.queryItems = [URLQueryItem(name: "mode", value: "playlists")]
    var request = URLRequest(url: components.url!)
    request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode < 300 else {
        throw NSError(domain: "LiveTV", code: 1)
    }
    struct Resp: Codable { let playlists: [BrowsePlaylistInfo] }
    return try JSONDecoder().decode(Resp.self, from: data).playlists
}

private func fetchLiveTVGroupedChannels(playlistId: String) async throws -> [BrowseSection] {
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
    return try JSONDecoder.supabase.decode(BrowseGroupedResponse.self, from: data).sections
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
