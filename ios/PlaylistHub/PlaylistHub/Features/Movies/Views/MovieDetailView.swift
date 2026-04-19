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
        if let cat = categoryTag { pills.append(cat) }
        pills.append(typeLabel)
        if let genre { pills.append(genre) }
        return pills
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

            floatingTopBar
        }
        .statusBarHidden()
        .preferredColorScheme(.dark)
        .fullScreenCover(isPresented: $showPlayer) {
            PlayerView(item: item, channelList: channelList)
        }
        .task {
            await loadRelated()
            loadSavedRating()
            previewVM.startPreview(for: item)
        }
        .onDisappear {
            previewVM.stop()
        }
    }

    // MARK: - Hero Section (Video Preview + Artwork Fallback)

    private var heroSection: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let heroHeight: CGFloat = width * 1.3

            ZStack(alignment: .bottom) {
                // Video preview layer (muted, autoplaying)
                if previewVM.isReady {
                    VideoPlayer(player: previewVM.player)
                        .disabled(true) // no user interaction on preview
                        .frame(width: width, height: heroHeight)
                        .clipped()
                        .transition(.opacity)
                } else if let url = item.resolvedLogoURL {
                    CachedAsyncImage(url: url) {
                        heroFallback(width: width, height: heroHeight)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: width, height: heroHeight)
                    .clipped()
                } else {
                    heroFallback(width: width, height: heroHeight)
                }

                // Bottom gradient fade to black
                VStack(spacing: 0) {
                    Spacer()
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.6), .black],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: heroHeight * 0.45)
                }

                // Mute toggle (bottom-right of hero)
                if previewVM.isReady {
                    HStack {
                        Spacer()
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
                        .padding(.trailing, 16)
                        .padding(.bottom, 80)
                    }
                }
            }
            .frame(width: width, height: heroHeight)
            .animation(.easeInOut(duration: 0.5), value: previewVM.isReady)
        }
        .aspectRatio(1 / 1.3, contentMode: .fit)
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

    // MARK: - Floating Top Bar

    private var floatingTopBar: some View {
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
        .padding(.top, 54)
    }

    // MARK: - Content Section

    private var contentSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Title
            Text(item.name)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(3)
                .padding(.bottom, 8)

            // Metadata row
            if !metadataPills.isEmpty {
                HStack(spacing: 6) {
                    ForEach(metadataPills, id: \.self) { pill in
                        Text(pill)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.6))
                        if pill != metadataPills.last {
                            Circle()
                                .fill(.white.opacity(0.3))
                                .frame(width: 3, height: 3)
                        }
                    }
                }
                .padding(.bottom, 16)
            } else {
                Spacer().frame(height: 16)
            }

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
        Button {} label: {
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
}