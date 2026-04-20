import SwiftUI
import AVKit
import AVFoundation

// MARK: - Netflix-Style Detail View (Movies & Series)

struct MovieDetailView: View {
    let item: PlaylistItem
    var channelList: [PlaylistItem]?
    @Environment(\.dismiss) private var dismiss
    @State private var showPlayer = false
    @State private var selectedTab = 0
    @State private var relatedItems: [PlaylistItem] = []
    @State private var isLoadingRelated = true

    // My List
    @StateObject private var myList = MyListManager.shared
    private var isInMyList: Bool { myList.isInList(item.streamUrl) }

    // Rating (local)
    @State private var showRating = false
    @State private var userRating: Int = 0
    @AppStorage("rating_") private var ratingStorage: String = ""
    private var ratingKey: String { "r_\(item.streamUrl.hashValue)" }

    // Preview player
    @StateObject private var previewVM = PreviewPlayerModel()

    // Related item navigation (More Like This)
    @State private var selectedRelatedItem: PlaylistItem?

    // Ken Burns animation for artwork fallback
    @State private var kenBurnsActive = false

    // Real metadata
    @State private var mediaDuration: String?
    @State private var seriesInfo: String?

    // Parse metadata
    private var genre: String? {
        guard let group = item.groupTitle else { return nil }
        let cleaned = group.components(separatedBy: "|").last?.trimmingCharacters(in: .whitespaces)
        return cleaned?.isEmpty == true ? nil : cleaned
    }

    private var categoryTag: String? {
        guard let group = item.groupTitle else { return nil }
        let parts = group.components(separatedBy: "|")
        return parts.count > 1 ? parts.first?.trimmingCharacters(in: .whitespaces) : nil
    }

    private var typeLabel: String {
        switch item.contentType {
        case .movie: return "Film"
        case .series: return "Series"
        case .channel: return "Live"
        case .uncategorized: return "Video"
        }
    }

    private var metadataPills: [String] {
        var pills: [String] = []
        if let year = item.parsedYear { pills.append(year) }
        if let cat = categoryTag { pills.append(cat) }
        pills.append(typeLabel)
        if let genre { pills.append(genre) }
        if let mediaDuration { pills.append(mediaDuration) }
        if let seriesInfo { pills.append(seriesInfo) }
        return pills
    }

    // MARK: - Premium Metadata Row

    private var metadataRow: some View {
        HStack(spacing: 8) {
            // Year — green accent (Netflix "match" style)
            if let year = item.parsedYear {
                Text(year)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color(red: 0.27, green: 0.78, blue: 0.44))
            }

            // Type badge — bordered pill
            Text(typeLabel)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.7))
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .overlay(
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .strokeBorder(.white.opacity(0.25), lineWidth: 1)
                )

            // Genre
            if let genre {
                metadataDot
                Text(genre)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.6))
            }

            // Duration (movies) or series info
            if let mediaDuration {
                metadataDot
                Text(mediaDuration)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.6))
            }

            if let seriesInfo {
                metadataDot
                Text(seriesInfo)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.6))
            }

            Spacer()
        }
    }

    private var metadataDot: some View {
        Circle()
            .fill(.white.opacity(0.3))
            .frame(width: 3, height: 3)
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    heroSection
                    contentSection
                        .padding(.horizontal, 16)
                }
            }
            .ignoresSafeArea(edges: .top)
        }
        .statusBarHidden()
        .preferredColorScheme(.dark)
        .fullScreenCover(isPresented: $showPlayer) {
            PlayerView(item: item, channelList: channelList)
        }
        .fullScreenCover(item: $selectedRelatedItem) { relatedItem in
            MovieDetailView(item: relatedItem)
        }
        .onChange(of: showPlayer) { _, isShowing in
            if isShowing {
                previewVM.stop()
            } else {
                previewVM.startPreview(for: item)
            }
        }
        .task {
            previewVM.startPreview(for: item)
            async let r: () = loadRelated()
            async let m: () = loadMediaMetadata()
            loadSavedRating()
            _ = await (r, m)
        }
        .onDisappear {
            previewVM.stop()
        }
    }

    // MARK: - Hero Section (Preview First)

    private var heroSection: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let heroHeight: CGFloat = width * 1.13 // reduced height for a sleeker look
            let topInset = max(geo.safeAreaInsets.top, 20)

            ZStack(alignment: .bottom) {
                // Layer 1: Artwork (always visible — instant, no black screen)
                if let url = item.resolvedLogoURL {
                    CachedAsyncImage(url: url) {
                        heroFallback(width: width, height: heroHeight)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: width, height: heroHeight)
                    .scaleEffect(kenBurnsActive ? 1.08 : 1.0)
                    .offset(x: kenBurnsActive ? -8 : 8, y: kenBurnsActive ? -6 : 4)
                    .clipped()
                    .onAppear {
                        withAnimation(.easeInOut(duration: 12).repeatForever(autoreverses: true)) {
                            kenBurnsActive = true
                        }
                    }
                } else {
                    heroFallback(width: width, height: heroHeight)
                }


                // Layer 2: Video preview (crossfades in over artwork when ready)
                if previewVM.state == .ready {
                    InteractivePreviewVideoLayer(
                        previewVM: previewVM,
                        onClose: { dismiss() }
                    )
                    .frame(width: width, height: heroHeight)
                    .clipped()
                    .transition(.opacity.animation(.easeIn(duration: 0.6)))
                }

                // Overlay: loading or unavailable state (poster always visible)
                if previewVM.state == .loading || previewVM.state == .idle {
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            ZStack {
                                // Animated red loading ring
                                Circle()
                                    .trim(from: 0, to: 0.85)
                                    .stroke(
                                        AngularGradient(
                                            gradient: Gradient(colors: [Color.red, Color.red.opacity(0.3), Color.red]),
                                            center: .center
                                        ),
                                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                                    )
                                    .frame(width: 64, height: 64)
                                    .rotationEffect(.degrees(Date().timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1) * 360))
                                    .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: previewVM.state)
                                // Play icon
                                Image(systemName: "play.fill")
                                    .font(.system(size: 32, weight: .bold))
                                    .foregroundStyle(Color.white)
                                    .shadow(color: .black.opacity(0.25), radius: 6, x: 0, y: 2)
                            }
                            Spacer()
                        }
                        Spacer()
                    }
                    .frame(width: width, height: heroHeight)
                } else if previewVM.state == .unavailable {
                    // Fallback: show poster/artwork with a warning icon and message
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            VStack(spacing: 10) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 32, weight: .bold))
                                    .foregroundStyle(Color.yellow)
                                    .shadow(color: .black.opacity(0.25), radius: 6, x: 0, y: 2)
                                Text("Preview unavailable")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Color.white.opacity(0.85))
                            }
                            Spacer()
                        }
                        Spacer()
                    }
                    .frame(width: width, height: heroHeight)
                }

                // Bottom gradient fade to black
                VStack(spacing: 0) {
                    Spacer()
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.5), .black.opacity(0.85), .black],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: heroHeight * 0.5)
                }

                // Top vignette (subtle)
                VStack(spacing: 0) {
                    LinearGradient(
                        colors: [.black.opacity(0.4), .clear],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: heroHeight * 0.15)
                    Spacer()
                }

                // Netflix-style red progress line — ONLY after real playback has started
                if previewVM.state == .ready && previewVM.isActuallyPlaying && previewVM.previewProgress > 0 {
                    VStack(spacing: 0) {
                        Spacer()
                        // Track background
                        ZStack(alignment: .leading) {
                            Rectangle()
                                .fill(.white.opacity(0.08))
                                .frame(height: 3)
                            Rectangle()
                                .fill(Color(red: 0.898, green: 0.035, blue: 0.078))
                                .frame(width: width * previewVM.previewProgress, height: 3)
                                .animation(.linear(duration: 0.1), value: previewVM.previewProgress)
                        }
                        .padding(.bottom, 6)
                    }
                    .frame(width: width, height: heroHeight)
                }

                // Mute toggle + preview badge (bottom-right of hero)
                if previewVM.state == .ready {
                    HStack(spacing: 8) {
                        Spacer()

                        // "PREVIEW" badge
                        Text("PREVIEW")
                            .font(.system(size: 9, weight: .bold))
                            .tracking(0.8)
                            .foregroundStyle(.white.opacity(0.7))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.black.opacity(0.4), in: Capsule())
                            .overlay(Capsule().strokeBorder(.white.opacity(0.15), lineWidth: 0.5))

                        Button {
                            previewVM.toggleMute()
                        } label: {
                            Image(systemName: previewVM.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 30, height: 30)
                                .background(.black.opacity(0.5), in: Circle())
                                .overlay(Circle().strokeBorder(.white.opacity(0.2), lineWidth: 0.5))
                        }
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 80)
                }

                // Dismiss button inside hero so it scrolls away with hero (not sticky)
                VStack {
                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 32, height: 32)
                                .background(.black.opacity(0.5), in: Circle())
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, topInset + 12)
                    Spacer()
                }
            }
            .frame(width: width, height: heroHeight)
            .animation(.easeInOut(duration: 0.5), value: previewVM.state)
        }
        .aspectRatio(1 / 1.13, contentMode: .fit)
    }

    private func previewLoadingLayer(width: CGFloat, height: CGFloat) -> some View {
        ZStack {
            LinearGradient(
                colors: [.black, .black.opacity(0.85), .black.opacity(0.65)],
                startPoint: .top,
                endPoint: .bottom
            )
            VStack(spacing: 10) {
                ProgressView()
                    .tint(.white.opacity(0.85))
                Text("Loading preview")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }
        }
        .frame(width: width, height: height)
    }

    private func heroFallback(width: CGFloat, height: CGFloat) -> some View {
        ZStack {
            LinearGradient(
                colors: PosterCard.gradientColors(for: item.name) + [.black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            VStack(spacing: 12) {
                Image(systemName: item.contentType == .series ? "rectangle.stack.fill" : "film.fill")
                    .font(.system(size: 48, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.12))
                Text(item.name)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white.opacity(0.3))
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .padding(.horizontal, 40)
            }
        }
        .frame(width: width, height: height)
    }

    // MARK: - Content Section

    private var contentSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Title
            Text(item.name)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(3)
                .padding(.top, 14)
                .padding(.bottom, 8)

            // Metadata row — premium compact layout
            metadataRow
                .padding(.bottom, 16)

            // Play button
            Button { showPlayer = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 18))
                    Text("Play")
                        .font(.system(size: 17, weight: .bold))
                }
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(.white, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 10)

            // Download button (dark variant)
            Button {} label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 15, weight: .semibold))
                    Text("Download")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(Color(white: 0.18), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 16)

            // Synopsis / category info
            if let group = item.groupTitle, !group.isEmpty {
                Text(group)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(4)
                    .lineSpacing(3)
                    .padding(.bottom, 16)
            }

            // Secondary actions (functional)
            secondaryActionsRow
                .padding(.bottom, 20)

            // Rating popover
            if showRating {
                ratingPopover
                    .padding(.bottom, 16)
                    .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }

            // Divider
            Rectangle()
                .fill(.white.opacity(0.08))
                .frame(height: 1)
                .padding(.bottom, 6)

            // Tabs
            tabSection

            // Related content
            relatedContentGrid
                .padding(.top, 12)
                .padding(.bottom, 40)
        }
        .padding(.top, -20)
    }

    // MARK: - Secondary Actions Row (Functional)

    private var secondaryActionsRow: some View {
        HStack(spacing: 40) {
            // My List — toggle
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    myList.toggle(item: item)
                }
            } label: {
                VStack(spacing: 6) {
                    Image(systemName: isInMyList ? "checkmark" : "plus")
                        .font(.system(size: 22, weight: .light))
                        .foregroundStyle(isInMyList ? .white : .white.opacity(0.65))
                    Text("My List")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(isInMyList ? .white.opacity(0.7) : .white.opacity(0.4))
                }
            }
            .buttonStyle(.plain)

            // Rate — toggle star popover
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    showRating.toggle()
                }
            } label: {
                VStack(spacing: 6) {
                    Image(systemName: userRating > 0 ? "hand.thumbsup.fill" : "hand.thumbsup")
                        .font(.system(size: 22, weight: .light))
                        .foregroundStyle(userRating > 0 ? .white : .white.opacity(0.65))
                    Text("Rate")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(userRating > 0 ? .white.opacity(0.7) : .white.opacity(0.4))
                }
            }
            .buttonStyle(.plain)

            // Share — native share sheet
            ShareLink(
                item: item.name,
                subject: Text(item.name),
                message: Text("Check out \(item.name) on PlaylistHub!")
            ) {
                VStack(spacing: 6) {
                    Image(systemName: "paperplane")
                        .font(.system(size: 22, weight: .light))
                        .foregroundStyle(.white.opacity(0.65))
                    Text("Share")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.white.opacity(0.4))
                }
            }

            Spacer()
        }
    }

    // MARK: - Rating Popover

    private var ratingPopover: some View {
        HStack(spacing: 12) {
            ForEach(1...5, id: \.self) { star in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        userRating = star == userRating ? 0 : star
                        saveRating()
                    }
                } label: {
                    Image(systemName: star <= userRating ? "star.fill" : "star")
                        .font(.system(size: 24, weight: .light))
                        .foregroundStyle(star <= userRating ? .yellow : .white.opacity(0.3))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color(white: 0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func loadSavedRating() {
        let all = UserDefaults.standard.dictionary(forKey: "ph_ratings") as? [String: Int] ?? [:]
        userRating = all[ratingKey] ?? 0
    }

    private func saveRating() {
        var all = UserDefaults.standard.dictionary(forKey: "ph_ratings") as? [String: Int] ?? [:]
        if userRating > 0 {
            all[ratingKey] = userRating
        } else {
            all.removeValue(forKey: ratingKey)
        }
        UserDefaults.standard.set(all, forKey: "ph_ratings")
    }

    // MARK: - Tabs

    private var tabSection: some View {
        HStack(spacing: 0) {
            tabButton(title: "More Like This", index: 0)
            if item.contentType == .series {
                tabButton(title: "Episodes", index: 1)
            }
            Spacer()
        }
    }

    private func tabButton(title: String, index: Int) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { selectedTab = index }
        } label: {
            VStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 14, weight: selectedTab == index ? .bold : .medium))
                    .foregroundStyle(selectedTab == index ? .white : .white.opacity(0.4))
                Rectangle()
                    .fill(selectedTab == index ? .red : .clear)
                    .frame(height: 2.5)
                    .clipShape(Capsule())
            }
            .padding(.trailing, 24)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Related Content Grid

    private var relatedContentGrid: some View {
        Group {
            if isLoadingRelated {
                HStack { Spacer(); ProgressView().tint(.white.opacity(0.3)); Spacer() }
                    .padding(.vertical, 30)
            } else if relatedItems.isEmpty {
                Text("No related titles found")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.25))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 30)
            } else {
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                ], spacing: 8) {
                    ForEach(relatedItems) { relatedItem in
                        relatedPoster(relatedItem)
                    }
                }
            }
        }
    }

    private func relatedPoster(_ relatedItem: PlaylistItem) -> some View {
        Button { selectedRelatedItem = relatedItem } label: {
            ZStack(alignment: .bottomLeading) {
                if let url = relatedItem.resolvedLogoURL {
                    CachedAsyncImage(url: url) {
                        relatedFallback(relatedItem)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(minWidth: 0, maxWidth: .infinity)
                    .frame(height: 160)
                    .clipped()
                } else {
                    relatedFallback(relatedItem)
                }
            }
            .frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                Text(relatedItem.name)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .padding(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        LinearGradient(colors: [.black.opacity(0.7), .clear],
                                       startPoint: .bottom, endPoint: .top)
                    )
                    .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 6, bottomTrailingRadius: 6))
            }
        }
        .buttonStyle(.plain)
    }

    private func relatedFallback(_ relatedItem: PlaylistItem) -> some View {
        ZStack {
            LinearGradient(
                colors: PosterCard.gradientColors(for: relatedItem.name),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: relatedItem.contentType == .series ? "rectangle.stack.fill" : "film.fill")
                .font(.system(size: 18, weight: .light))
                .foregroundStyle(.white.opacity(0.15))
        }
        .frame(height: 160)
    }

    // MARK: - Data Loading

    private func loadRelated() async {
        do {
            let response = try await DataService.shared.fetchItems(
                playlistId: item.playlistId,
                contentType: item.contentType,
                groupTitle: item.groupTitle,
                page: 1,
                limit: 18
            )
            relatedItems = response.items.filter { $0.id != item.id }
        } catch {
            relatedItems = []
        }
        isLoadingRelated = false
    }

    private func loadMediaMetadata() async {
        if item.contentType == .movie {
            // Extract duration from player once preview is ready
            mediaDuration = await extractDurationFromPreview()
        } else if item.contentType == .series {
            // Fetch season/episode counts
            do {
                let response = try await DataService.shared.fetchSeriesEpisodes(streamUrl: item.streamUrl)
                let seasonCount = response.seasons.count
                let episodeCount = response.seasons.reduce(0) { $0 + $1.episodes.count }
                if seasonCount > 0 {
                    let parts = [
                        seasonCount == 1 ? "1 Season" : "\(seasonCount) Seasons",
                        "\(episodeCount) Ep."
                    ]
                    seriesInfo = parts.joined(separator: " · ")
                }
                // Try to get episode runtime from first episode's info
                if mediaDuration == nil {
                    let firstEp = response.seasons
                        .sorted(by: { $0.season < $1.season })
                        .first?.episodes
                        .sorted(by: { $0.episode < $1.episode })
                        .first
                    if let dur = firstEp?.info?.duration, !dur.isEmpty {
                        mediaDuration = formatEpisodeDuration(dur)
                    }
                }
            } catch {
                // Gracefully hidden
            }
        }
    }

    private func extractDurationFromPreview() async -> String? {
        // Wait up to 8s for the player item to have a valid duration
        for _ in 0..<40 {
            if let playerItem = previewVM.player.currentItem {
                let dur = playerItem.duration
                if dur.isValid && !dur.isIndefinite {
                    let total = Int(CMTimeGetSeconds(dur))
                    if total > 60 {
                        let h = total / 3600
                        let m = (total % 3600) / 60
                        if h > 0 {
                            return "\(h)h \(m)m"
                        } else {
                            return "\(m) min"
                        }
                    }
                }
            }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        return nil
    }

    /// Parse Xtream episode duration (can be "HH:MM:SS", minutes string, etc.)
    private func formatEpisodeDuration(_ raw: String) -> String? {
        // "01:23:45" format
        let parts = raw.split(separator: ":")
        if parts.count == 3,
           let h = Int(parts[0]), let m = Int(parts[1]) {
            if h > 0 { return "\(h)h \(m)m/ep" }
            if m > 0 { return "\(m) min/ep" }
        }
        // "00:45:00" format
        if parts.count == 3, let m = Int(parts[1]), m > 0 {
            return "\(m) min/ep"
        }
        // Plain minutes
        if let mins = Int(raw.trimmingCharacters(in: .whitespaces)), mins > 0 {
            return "\(mins) min/ep"
        }
        return nil
    }
}

// MARK: - Interactive Preview Video Layer (Netflix-style controls)

struct InteractivePreviewVideoLayer: View {
    @ObservedObject var previewVM: PreviewPlayerModel
    var onClose: () -> Void

    @State private var showControls = false
    @State private var autoHideTask: Task<Void, Never>? = nil

    var body: some View {
        ZStack {
            // Video rendering layer
            PreviewVideoLayer(player: previewVM.player)
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showControls.toggle()
                    }
                    if showControls {
                        scheduleAutoHide()
                    }
                }

            // Controls overlay — Netflix-style scrim + controls
            if showControls {
                // Darkening scrim
                Color.black.opacity(0.35)
                    .allowsHitTesting(false)

                // Close button (top-left)
                VStack {
                    HStack {
                        Button(action: onClose) {
                            Image(systemName: "xmark")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 36, height: 36)
                                .background(.black.opacity(0.5), in: Circle())
                                .overlay(Circle().strokeBorder(.white.opacity(0.15), lineWidth: 0.5))
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    Spacer()
                }

                // Center play/pause
                Button {
                    previewVM.togglePlayPause()
                    scheduleAutoHide()
                } label: {
                    Image(systemName: previewVM.isActuallyPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 36, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(width: 72, height: 72)
                        .background(.ultraThinMaterial.opacity(0.6), in: Circle())
                        .overlay(Circle().strokeBorder(.white.opacity(0.15), lineWidth: 0.5))
                        .shadow(color: .black.opacity(0.3), radius: 12, x: 0, y: 4)
                }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .onDisappear {
            autoHideTask?.cancel()
        }
    }

    private func scheduleAutoHide() {
        autoHideTask?.cancel()
        autoHideTask = Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.3)) {
                showControls = false
            }
        }
    }
}

// MARK: - Preview Video Layer (AVPlayerLayer — no controls, pure rendering)

private struct PreviewVideoLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PreviewPlayerUIView {
        let view = PreviewPlayerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ uiView: PreviewPlayerUIView, context: Context) {
        uiView.playerLayer.player = player
    }
}

private class PreviewPlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
