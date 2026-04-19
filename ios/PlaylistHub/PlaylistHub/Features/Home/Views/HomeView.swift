import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var themeManager: ThemeManager
    @EnvironmentObject private var remoteConfig: RemoteConfigService
    @StateObject private var vm = HomeViewModel()
    @State private var showAddSheet = false
    @State private var selectedItem: PlaylistItem?

    private var accent: Color { themeManager.accentColor }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    // Server-driven section ordering
                    ForEach(remoteConfig.enabledHomeSections) { section in
                        homeSectionView(for: section.id)
                    }

                    // Top 10 — always injected if not in server config
                    if !remoteConfig.enabledHomeSections.contains(where: { $0.id == "top10" }),
                       !vm.top10Movies.isEmpty {
                        top10Section
                            .padding(.bottom, 28)
                    }
                }
            }
            .background(Color(.systemBackground))
            .refreshable { await vm.load() }
            .overlay {
                if vm.isLoading && vm.playlists.isEmpty {
                    ProgressView()
                        .tint(accent)
                }
            }
            .sheet(isPresented: $showAddSheet) {
                AddPlaylistSheet(onAdded: { playlist in
                    vm.playlists.insert(playlist, at: 0)
                    showAddSheet = false
                })
                .presentationDetents([.medium])
            }
            .alert(remoteConfig.strings.signOutTitle, isPresented: $vm.showDeleteConfirm, presenting: vm.deleteTarget) { playlist in
                Button(remoteConfig.strings.deleteButton, role: .destructive) {
                    Task { await vm.delete(playlist) }
                }
                Button(remoteConfig.strings.cancelButton, role: .cancel) {}
            } message: { playlist in
                Text("This will permanently delete \"\(playlist.name)\" and all its content.")
            }
            .fullScreenCover(item: $selectedItem, onDismiss: {
                vm.refreshWatchHistory()
            }) { item in
                MovieDetailView(item: item)
            }
        }
        .task { await vm.load() }
    }

    // MARK: - Server-Driven Section Router

    @ViewBuilder
    private func homeSectionView(for id: String) -> some View {
        switch id {
        case "hero":
            heroSection
                .padding(.bottom, 28)

        case "quickActions":
            if remoteConfig.features.quickActionsEnabled {
                quickActions
                    .padding(.bottom, 28)
            }

        case "stats":
            if remoteConfig.features.statsRibbonEnabled {
                statsRibbon
                    .padding(.bottom, 28)
            }

        case "continueWatching":
            if remoteConfig.features.continueWatchingEnabled && !vm.watchHistory.isEmpty {
                let sec = remoteConfig.homeSection("continueWatching")
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: sec?.icon ?? "clock.fill")
                            .font(.system(size: 13))
                            .foregroundStyle(accent)
                        Text(sec?.title ?? "Continue Watching")
                            .font(.subheadline.weight(.semibold))
                    }
                    Spacer()
                    if vm.watchHistory.count > 3 {
                        Button {
                            vm.clearHistory()
                        } label: {
                            Text("Clear")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 10)

                continueWatchingRail
                    .padding(.bottom, 28)
            }

        case "featuredMovies":
            if remoteConfig.features.featuredContentEnabled && !vm.featuredMovies.isEmpty {
                let sec = remoteConfig.homeSection("featuredMovies")
                sectionHeader(sec?.title ?? "Featured Movies", icon: sec?.icon ?? "film.fill", action: {
                    appState.selectedTab = .movies
                })
                featuredMoviesRail
                    .padding(.bottom, 28)
            }

        case "top10":
            if !vm.top10Movies.isEmpty {
                top10Section
                    .padding(.bottom, 28)
            }

        case "featuredSeries":
            if remoteConfig.features.featuredContentEnabled && !vm.featuredSeries.isEmpty {
                let sec = remoteConfig.homeSection("featuredSeries")
                sectionHeader(sec?.title ?? "Popular Series", icon: sec?.icon ?? "rectangle.stack.fill", action: {
                    appState.selectedTab = .series
                })
                featuredSeriesRail
                    .padding(.bottom, 28)
            }

        case "playlists":
            playlistsSection
                .padding(.bottom, 40)

        default:
            // Always show Top 10 if movies exist and section not explicitly listed
            if id == "" && !vm.top10Movies.isEmpty {
                top10Section
                    .padding(.bottom, 28)
            }
            EmptyView()
        }
    }

    // MARK: - Hero Section

    private var heroSection: some View {
        VStack(spacing: 0) {
            // Gradient header background
            ZStack(alignment: .bottomLeading) {
                LinearGradient(
                    colors: [accent.opacity(0.25), accent.opacity(0.08), .clear],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .frame(height: 180)

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(greetingText)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)
                                .tracking(1.2)
                            Text(userName)
                                .font(.title.bold())
                        }
                        Spacer()
                        // Avatar
                        ZStack {
                            Circle()
                                .fill(accent.opacity(0.15))
                                .frame(width: 48, height: 48)
                            Text(initials)
                                .font(.system(size: 17, weight: .bold))
                                .foregroundStyle(accent)
                        }
                    }

                    if vm.totalContent > 0 {
                        Text("\(vm.totalContent.abbreviated) items across \(vm.playlists.count) playlist\(vm.playlists.count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    // MARK: - Quick Actions (server-driven)

    private var quickActions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(remoteConfig.enabledQuickActions) { action in
                    let gradient: [Color] = action.gradientColors.isEmpty
                        ? [accent.opacity(0.7), accent.opacity(0.4)]
                        : action.gradientColors.map { RemoteConfigService.color(from: $0) }
                    QuickActionCard(
                        icon: action.icon,
                        title: action.title,
                        subtitle: dynamicSubtitle(for: action) ?? action.subtitle ?? "",
                        gradient: gradient,
                        action: { handleQuickAction(action.destination) }
                    )
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func dynamicSubtitle(for action: QuickActionConfig) -> String? {
        switch action.id {
        case "liveTV": return "\(vm.totalChannels.abbreviated) channels"
        case "movies": return "\(vm.totalMovies.abbreviated) titles"
        case "series": return "\(vm.totalSeries.abbreviated) shows"
        default: return nil
        }
    }

    private func handleQuickAction(_ destination: String) {
        switch destination {
        case "liveTV": appState.selectedTab = .liveTV
        case "movies": appState.selectedTab = .movies
        case "series": appState.selectedTab = .series
        case "settings": appState.selectedTab = .settings
        case "addPlaylist": showAddSheet = true
        default: break
        }
    }

    // MARK: - Stats Ribbon

    private var statsRibbon: some View {
        HStack(spacing: 0) {
            StatPill(value: "\(vm.playlists.count)", label: "Playlists", color: accent)
            StatDivider()
            StatPill(value: vm.totalChannels.abbreviated, label: "Channels", color: .blue)
            StatDivider()
            StatPill(value: vm.totalMovies.abbreviated, label: "Movies", color: .purple)
            StatDivider()
            StatPill(value: vm.totalSeries.abbreviated, label: "Series", color: .orange)
        }
        .padding(.vertical, 14)
        .background(Color(.systemGray6).opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 20)
    }

    // MARK: - Continue Watching Rail

    private var continueWatchingRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 14) {
                ForEach(vm.watchHistory) { entry in
                    Button {
                        // Convert history entry back to a PlaylistItem for playback
                        selectedItem = vm.playlistItem(from: entry)
                    } label: {
                        ContinueWatchingCard(entry: entry, accent: accent)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button(role: .destructive) {
                            vm.removeFromHistory(entry.itemId)
                        } label: {
                            Label("Remove", systemImage: "xmark.circle")
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Featured Movies Rail

    private var featuredMoviesRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 12) {
                ForEach(vm.featuredMovies) { item in
                    Button { selectedItem = item } label: {
                        PosterCard(item: item)
                            .frame(width: 120)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Featured Series Rail

    private var featuredSeriesRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 12) {
                ForEach(vm.featuredSeries) { item in
                    Button { selectedItem = item } label: {
                        PosterCard(item: item)
                            .frame(width: 120)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Top 10 Section

    private var top10Section: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section header
            HStack(spacing: 8) {
                Text("TOP")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(accent)
                +
                Text(" 10")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(.primary)

                Text("Movies Today")
                    .font(.subheadline.weight(.semibold))

                Spacer()
            }
            .padding(.horizontal, 20)

            // Horizontal scroll rail
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(Array(vm.top10Movies.enumerated()), id: \.element.id) { index, item in
                        Button { selectedItem = item } label: {
                            Top10Card(item: item, rank: index + 1, accentColor: accent)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
            }
        }
    }

    // MARK: - Playlists Section

    private var playlistsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "list.bullet.rectangle.portrait.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(accent)
                    Text("Your Playlists")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                Button { showAddSheet = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(accent, in: Circle())
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
                .padding(.bottom, 20)
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(vm.playlists) { playlist in
                        NavigationLink {
                            PlaylistDetailView(playlist: playlist)
                        } label: {
                            PremiumPlaylistRow(playlist: playlist, accent: accent)
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

    // MARK: - Section Header

    private func sectionHeader(_ title: String, icon: String, action: (() -> Void)? = nil) -> some View {
        HStack {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundStyle(accent)
                Text(title)
                    .font(.subheadline.weight(.semibold))
            }
            Spacer()
            if let action {
                Button(action: action) {
                    HStack(spacing: 3) {
                        Text("See All")
                            .font(.caption.weight(.medium))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(accent)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 10)
    }

    // MARK: - Helpers

    private var userName: String {
        authManager.currentUser?.displayName ??
        authManager.currentUser?.email.components(separatedBy: "@").first ?? "User"
    }

    private var initials: String {
        if let name = authManager.currentUser?.displayName, !name.isEmpty {
            return String(name.prefix(2)).uppercased()
        }
        if let email = authManager.currentUser?.email {
            return String(email.prefix(2)).uppercased()
        }
        return "PH"
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        case 17..<22: return "Good evening"
        default: return "Good night"
        }
    }
}

// MARK: - Quick Action Card

private struct QuickActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let gradient: [Color]
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer(minLength: 0)
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.7))
            }
            .padding(14)
            .frame(width: 110, height: 100, alignment: .topLeading)
            .background(
                LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Stat Pill

private struct StatPill: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 3) {
            Text(value)
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.5)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct StatDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color(.separator).opacity(0.3))
            .frame(width: 0.5, height: 28)
    }
}

// MARK: - Continue Watching Card (Premium Cinematic)

private struct ContinueWatchingCard: View {
    let entry: WatchHistoryEntry
    let accent: Color

    private let cardWidth: CGFloat = 260
    private let cardHeight: CGFloat = 146

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // ── Cinematic Thumbnail ──
            ZStack(alignment: .bottom) {
                // Thumbnail / poster image
                thumbnailLayer
                    .frame(width: cardWidth, height: cardHeight)
                    .clipped()

                // Bottom gradient for readability
                LinearGradient(
                    colors: [.clear, .clear, .black.opacity(0.4), .black.opacity(0.85)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                // Content overlay at bottom
                VStack(alignment: .leading, spacing: 5) {
                    Spacer()

                    // Title
                    Text(entry.name)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)

                    // Metadata row
                    HStack(spacing: 6) {
                        // Content type badge
                        contentTypeBadge

                        if let group = entry.groupTitle {
                            Text(group)
                                .font(.system(size: 9))
                                .foregroundStyle(.white.opacity(0.6))
                                .lineLimit(1)
                        }

                        Spacer(minLength: 0)

                        // Time info
                        if entry.isLive {
                            HStack(spacing: 3) {
                                Circle().fill(.red).frame(width: 4, height: 4)
                                Text("LIVE")
                                    .font(.system(size: 8, weight: .heavy))
                                    .foregroundStyle(.red)
                            }
                        } else if let remaining = entry.remainingText {
                            Text(remaining)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                    }

                    // ── Progress bar ──
                    if !entry.isLive && entry.duration > 0 {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                // Track
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(.white.opacity(0.15))
                                    .frame(height: 3)

                                // Fill
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(accent)
                                    .frame(width: geo.size.width * entry.progress, height: 3)
                                    .shadow(color: accent.opacity(0.5), radius: 4, y: 0)
                            }
                        }
                        .frame(height: 3)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
            }
            .frame(width: cardWidth, height: cardHeight)
            // ── Play button — centered in the card via overlay ──
            .overlay {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 42, height: 42)
                    .overlay {
                        Image(systemName: "play.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .offset(x: 1)
                    }
                    .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            // ── Below-card metadata ──
            HStack(spacing: 4) {
                Text(entry.watchedAgoText)
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
            .padding(.top, 6)
            .padding(.horizontal, 2)
        }
        .frame(width: cardWidth)
    }

    // MARK: - Thumbnail Layer

    @ViewBuilder
    private var thumbnailLayer: some View {
        if let url = entry.resolvedLogoURL {
            CachedAsyncImage(url: url) {
                brandedFallback
            }
            .aspectRatio(contentMode: .fill)
        } else {
            brandedFallback
        }
    }

    // MARK: - Branded Fallback (no generic empty cards)

    private var brandedFallback: some View {
        ZStack {
            // Rich gradient based on content
            LinearGradient(
                colors: PosterCard.gradientColors(for: entry.name),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Subtle pattern overlay
            VStack {
                HStack {
                    Spacer()
                    Image(systemName: contentIcon)
                        .font(.system(size: 60, weight: .ultraLight))
                        .foregroundStyle(.white.opacity(0.08))
                        .rotationEffect(.degrees(-15))
                        .offset(x: 20, y: -10)
                }
                Spacer()
            }

            // Centered content icon
            VStack(spacing: 6) {
                Image(systemName: contentIcon)
                    .font(.system(size: 28, weight: .light))
                    .foregroundStyle(.white.opacity(0.35))
                Text(entry.name)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.3))
                    .lineLimit(1)
                    .frame(maxWidth: 160)
            }
        }
    }

    // MARK: - Content Type Badge

    private var contentTypeBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: contentIcon)
                .font(.system(size: 7, weight: .bold))
            Text(contentLabel)
                .font(.system(size: 8, weight: .bold))
                .textCase(.uppercase)
        }
        .foregroundStyle(badgeColor)
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(badgeColor.opacity(0.2))
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }

    private var contentIcon: String {
        switch entry.contentType {
        case "channel": return "tv.fill"
        case "movie": return "film.fill"
        case "series": return "rectangle.stack.fill"
        default: return "play.rectangle.fill"
        }
    }

    private var contentLabel: String {
        switch entry.contentType {
        case "channel": return "Live"
        case "movie": return "Movie"
        case "series": return "Series"
        default: return "Video"
        }
    }

    private var badgeColor: Color {
        switch entry.contentType {
        case "channel": return .red
        case "movie": return .purple
        case "series": return .orange
        default: return .blue
        }
    }
}

// MARK: - Premium Playlist Row

struct PremiumPlaylistRow: View {
    let playlist: Playlist
    let accent: Color

    var body: some View {
        HStack(spacing: 14) {
            // Icon block
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [statusColor.opacity(0.25), statusColor.opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                Image(systemName: statusIcon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(statusColor)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(playlist.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Label("\(playlist.channelsCount.abbreviated)", systemImage: "tv")
                    Label("\(playlist.moviesCount.abbreviated)", systemImage: "film")
                    Label("\(playlist.seriesCount.abbreviated)", systemImage: "rectangle.stack")
                }
                .font(.system(size: 9))
                .foregroundStyle(.secondary)

                if let date = playlist.lastScanAt {
                    Text("Updated \(date.relativeString)")
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer(minLength: 4)

            // Status pill
            HStack(spacing: 3) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 5, height: 5)
                Text(playlist.status.rawValue.capitalized)
                    .font(.system(size: 8, weight: .bold))
                    .textCase(.uppercase)
            }
            .foregroundStyle(statusColor)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(statusColor.opacity(0.1))
            .clipShape(Capsule())

            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.quaternary)
        }
        .padding(14)
        .background(Color(.systemGray6).opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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

// MARK: - Top 10 Card

struct Top10Card: View {
    let item: PlaylistItem
    let rank: Int
    let accentColor: Color

    private let posterWidth: CGFloat = 110
    private let posterHeight: CGFloat = 164

    /// Two-digit ranks need more room for the numeral
    private var isDoubleDigit: Bool { rank >= 10 }
    private var numeralWidth: CGFloat { isDoubleDigit ? 72 : 48 }
    private var cellWidth: CGFloat { numeralWidth + posterWidth }
    private var fontSize: CGFloat { isDoubleDigit ? 120 : 150 }

    var body: some View {
        ZStack(alignment: .leading) {
            // Layer 1: Large ranking numeral (behind poster)
            rankNumeral
                .frame(width: cellWidth, height: posterHeight, alignment: .leading)

            // Layer 2: Poster card (overlapping the numeral, offset right)
            posterCard
                .frame(width: posterWidth, height: posterHeight)
                .offset(x: numeralWidth)
        }
        .frame(width: cellWidth, height: posterHeight + 8)
    }

    // MARK: - Rank Numeral

    private var rankNumeral: some View {
        Text("\(rank)")
            .font(.system(size: fontSize, weight: .black, design: .rounded))
            .italic()
            .foregroundStyle(
                LinearGradient(
                    colors: [
                        Color(.systemGray4).opacity(0.5),
                        Color(.systemGray5).opacity(0.2)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .overlay(
                Text("\(rank)")
                    .font(.system(size: fontSize, weight: .black, design: .rounded))
                    .italic()
                    .foregroundStyle(.clear)
                    .background(.clear)
                    .overlay(
                        Text("\(rank)")
                            .font(.system(size: fontSize, weight: .black, design: .rounded))
                            .italic()
                            .foregroundStyle(Color(.systemGray3).opacity(0.45))
                            .mask(
                                ZStack {
                                    Text("\(rank)")
                                        .font(.system(size: fontSize, weight: .black, design: .rounded))
                                        .italic()
                                        .foregroundStyle(.white)
                                        .offset(x: -1.5)
                                    Text("\(rank)")
                                        .font(.system(size: fontSize, weight: .black, design: .rounded))
                                        .italic()
                                        .foregroundStyle(.white)
                                        .offset(x: 1.5)
                                    Text("\(rank)")
                                        .font(.system(size: fontSize, weight: .black, design: .rounded))
                                        .italic()
                                        .foregroundStyle(.white)
                                        .offset(y: -1.5)
                                    Text("\(rank)")
                                        .font(.system(size: fontSize, weight: .black, design: .rounded))
                                        .italic()
                                        .foregroundStyle(.white)
                                        .offset(y: 1.5)
                                    Text("\(rank)")
                                        .font(.system(size: fontSize, weight: .black, design: .rounded))
                                        .italic()
                                        .foregroundStyle(.black)
                                }
                            )
                    )
            )
            .fixedSize()
            .offset(x: isDoubleDigit ? -4 : 2, y: 8)
    }

    // MARK: - Poster

    private var posterCard: some View {
        ZStack(alignment: .bottomLeading) {
            if let url = item.resolvedLogoURL {
                CachedAsyncImage(url: url) {
                    posterFallback
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: posterWidth, height: posterHeight)
                .clipped()
            } else {
                posterFallback
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(.white.opacity(0.08), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
    }

    private var posterFallback: some View {
        ZStack {
            LinearGradient(
                colors: PosterCard.gradientColors(for: item.name),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            VStack(spacing: 6) {
                Image(systemName: "film.fill")
                    .font(.system(size: 20, weight: .light))
                    .foregroundStyle(.white.opacity(0.5))
                Text(item.name)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .padding(.horizontal, 6)
            }
        }
        .frame(width: posterWidth, height: posterHeight)
    }
}

// MARK: - ViewModel

@MainActor
final class HomeViewModel: ObservableObject {
    @Published var playlists: [Playlist] = []
    @Published var watchHistory: [WatchHistoryEntry] = []
    @Published var featuredMovies: [PlaylistItem] = []
    @Published var featuredSeries: [PlaylistItem] = []
    @Published var top10Movies: [PlaylistItem] = []
    @Published var isLoading = false
    @Published var showDeleteConfirm = false
    @Published var deleteTarget: Playlist?

    private var hasLoaded = false

    var totalChannels: Int { playlists.reduce(0) { $0 + $1.channelsCount } }
    var totalMovies: Int { playlists.reduce(0) { $0 + $1.moviesCount } }
    var totalSeries: Int { playlists.reduce(0) { $0 + $1.seriesCount } }
    var totalContent: Int { playlists.reduce(0) { $0 + $1.totalItems } }

    func load() async {
        // On subsequent tab returns, only refresh watch history (instant)
        watchHistory = WatchHistoryManager.shared.continueWatchingItems
        if hasLoaded {
            // Refresh playlists from cache (no network if fresh)
            if let cached = try? await PlaylistCache.shared.fetchPlaylists() {
                playlists = cached
            }
            return
        }

        isLoading = true
        do {
            playlists = try await PlaylistCache.shared.fetchPlaylists()
            // Load featured content from first active playlist
            if let primary = playlists.first(where: { $0.status == .active }) ?? playlists.first {
                async let moviesTask = DataService.shared.fetchItems(
                    playlistId: primary.id, contentType: .movie, page: 1, limit: 20
                )
                async let seriesTask = DataService.shared.fetchItems(
                    playlistId: primary.id, contentType: .series, page: 1, limit: 20
                )

                let (moviesResp, seriesResp) = try await (moviesTask, seriesTask)
                featuredMovies = Array(moviesResp.items.prefix(15))
                featuredSeries = Array(seriesResp.items.prefix(15))

                // Top 10: prioritize movies with poster art, stable sort by name
                let withArt = moviesResp.items.filter { $0.resolvedLogoURL != nil }
                let withoutArt = moviesResp.items.filter { $0.resolvedLogoURL == nil }
                let ranked = (withArt.sorted(by: { $0.name < $1.name }) + withoutArt.sorted(by: { $0.name < $1.name }))
                top10Movies = Array(ranked.prefix(10))

                // If first playlist didn't have enough, try additional playlists
                if top10Movies.count < 10 {
                    for extra in playlists.dropFirst().prefix(2) where extra.status == .active {
                        let moreResp = try await DataService.shared.fetchItems(
                            playlistId: extra.id, contentType: .movie, page: 1, limit: 20
                        )
                        let existingIds = Set(top10Movies.map(\.id))
                        let newItems = moreResp.items.filter { !existingIds.contains($0.id) }
                        let newWithArt = newItems.filter { $0.resolvedLogoURL != nil }.sorted(by: { $0.name < $1.name })
                        top10Movies.append(contentsOf: newWithArt)
                        if top10Movies.count >= 10 { break }
                    }
                    top10Movies = Array(top10Movies.prefix(10))
                }
            }
        } catch {}
        isLoading = false
        hasLoaded = true
    }

    /// Convert a watch history entry back to a PlaylistItem for the player
    func playlistItem(from entry: WatchHistoryEntry) -> PlaylistItem {
        PlaylistItem(
            id: entry.itemId,
            playlistId: entry.playlistId,
            name: entry.name,
            streamUrl: entry.streamUrl,
            logoUrl: entry.logoUrl,
            groupTitle: entry.groupTitle,
            contentType: ContentType(rawValue: entry.contentType) ?? .uncategorized,
            createdAt: entry.lastWatchedAt
        )
    }

    func removeFromHistory(_ itemId: UUID) {
        WatchHistoryManager.shared.remove(itemId: itemId)
        watchHistory = WatchHistoryManager.shared.continueWatchingItems
    }

    /// Called when the player is dismissed to pick up newly saved history
    func refreshWatchHistory() {
        watchHistory = WatchHistoryManager.shared.continueWatchingItems
    }

    func clearHistory() {
        WatchHistoryManager.shared.clearAll()
        watchHistory = []
    }

    func delete(_ playlist: Playlist) async {
        do {
            try await DataService.shared.deletePlaylist(id: playlist.id)
            playlists.removeAll { $0.id == playlist.id }
        } catch {}
    }
}
