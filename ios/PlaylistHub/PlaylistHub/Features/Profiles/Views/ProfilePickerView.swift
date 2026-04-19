import SwiftUI

// MARK: - Profile Picker View

struct ProfilePickerView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var themeManager: ThemeManager
    @StateObject private var profileManager = ProfileManager.shared
    @StateObject private var artworkVM = BackdropViewModel()

    @State private var appeared = false
    @State private var selectedId: UUID?
    @State private var isEditing = false
    @State private var showAddSheet = false
    @State private var editingProfile: UserProfile?

    let onProfileSelected: () -> Void

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Layer 1: Black base
                Color.black.ignoresSafeArea()

                // Layer 2: Cinematic backdrop in upper portion
                backdropLayer(size: geo.size)
                    .ignoresSafeArea()

                // Layer 3: Cinematic overlay
                cinematicOverlay
                    .ignoresSafeArea()

                // Layer 4: Content
                VStack(spacing: 0) {
                    Spacer()

                    // Glass panel — elevated surface behind profiles
                    profilePanel(safeBottom: geo.safeAreaInsets.bottom)
                }
            }
        }
        .ignoresSafeArea()
        .onAppear {
            ensureDefaultProfile()
            withAnimation(.easeOut(duration: 0.8).delay(0.2)) {
                appeared = true
            }
        }
        .sheet(isPresented: $showAddSheet) { addProfileSheet }
        .sheet(item: $editingProfile) { profile in
            editProfileSheet(profile)
        }
    }

    // MARK: - Cinematic Backdrop

    private func backdropLayer(size: CGSize) -> some View {
        ZStack {
            // Ambient warm dark fallback
            AnimatedGradientBackground()

            // Artwork — upper portion, anchored top
            ForEach(artworkVM.loadedImages.indices, id: \.self) { idx in
                let entry = artworkVM.loadedImages[idx]

                // Blurred ambient fill — lets artwork color tint the whole screen
                Image(uiImage: entry.image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size.width, height: size.height)
                    .blur(radius: 50)
                    .opacity(artworkVM.activeIndex == idx ? 0.6 : 0)
                    .animation(.easeInOut(duration: 2.0), value: artworkVM.activeIndex)
                    .clipped()

                // Sharp hero image — top-anchored, fills upper ~65%
                Image(uiImage: entry.image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size.width, height: size.height * 0.65)
                    .clipped()
                    .frame(maxHeight: .infinity, alignment: .top)
                    .scaleEffect(artworkVM.activeIndex == idx ? 1.05 : 1.0, anchor: .top)
                    .animation(.easeInOut(duration: 12), value: artworkVM.activeIndex)
                    .opacity(artworkVM.activeIndex == idx ? 1 : 0)
                    .animation(.easeInOut(duration: 1.4), value: artworkVM.activeIndex)
            }
        }
    }

    private var cinematicOverlay: some View {
        ZStack {
            // Bottom fade — artwork dissolves smoothly into dark lower section
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0.0),
                    .init(color: .black.opacity(0.03), location: 0.25),
                    .init(color: .black.opacity(0.20), location: 0.38),
                    .init(color: .black.opacity(0.55), location: 0.48),
                    .init(color: .black.opacity(0.82), location: 0.56),
                    .init(color: .black.opacity(0.94), location: 0.63),
                    .init(color: .black.opacity(0.98), location: 0.70),
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Top edge darken for status bar
            LinearGradient(
                colors: [.black.opacity(0.4), .clear],
                startPoint: .top,
                endPoint: .init(x: 0.5, y: 0.12)
            )
        }
        .allowsHitTesting(false)
    }

    // MARK: - Profile Panel (glass surface behind profiles)

    private func profilePanel(safeBottom: CGFloat) -> some View {
        VStack(spacing: 0) {
            // Heading
            Text("Who's watching?")
                .font(.system(size: 17, weight: .regular))
                .tracking(0.4)
                .foregroundStyle(.white.opacity(0.8))
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 10)
                .padding(.top, 28)
                .padding(.bottom, 24)

            // Profile grid
            profileGrid
                .padding(.horizontal, 28)
                .padding(.bottom, max(safeBottom, 16) + 12)
        }
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                // Curved glass panel
                UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32)
                    .fill(.ultraThinMaterial.opacity(0.55))

                // Subtle warm tint on the glass
                UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.04),
                                Color.white.opacity(0.01),
                                Color.clear
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                // Top edge highlight
                UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32)
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.12), .white.opacity(0.04), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 0.5
                    )
            }
            .ignoresSafeArea(edges: .bottom)
        )
    }

    // MARK: - Profile Grid (profiles + add + edit, always 3 columns)

    private var profileGrid: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: 16), count: 3)

        return LazyVGrid(columns: cols, spacing: 20) {
            // Real profiles
            ForEach(Array(profileManager.profiles.enumerated()), id: \.element.id) { index, profile in
                profileTile(profile, index: index)
            }

            // Add tile (if room)
            if profileManager.profiles.count < 5 {
                actionTile(
                    icon: "plus",
                    label: "Add",
                    index: profileManager.profiles.count
                ) {
                    showAddSheet = true
                }
            }

            // Edit tile (always present)
            actionTile(
                icon: "pencil",
                label: "Edit",
                index: profileManager.profiles.count + (profileManager.profiles.count < 5 ? 1 : 0)
            ) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    isEditing.toggle()
                }
            }
        }
        .frame(maxWidth: 360)
    }

    private let tileSize: CGFloat = 92
    private let tileRadius: CGFloat = 20

    private func profileTile(_ profile: UserProfile, index: Int) -> some View {
        let colors = UserProfile.avatarColors[profile.avatarColorIndex % UserProfile.avatarColors.count]
        let stagger = Double(index) * 0.06
        let isSelected = selectedId == profile.id
        let topColor = Color(red: colors.top.r, green: colors.top.g, blue: colors.top.b)
        let botColor = Color(red: colors.bot.r, green: colors.bot.g, blue: colors.bot.b)

        return Button {
            guard !isEditing else {
                editingProfile = profile
                return
            }
            selectProfile(profile)
        } label: {
            VStack(spacing: 10) {
                ZStack {
                    // Background gradient
                    RoundedRectangle(cornerRadius: tileRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [topColor, botColor],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: tileSize, height: tileSize)

                    // Inner highlight (top-left gloss)
                    RoundedRectangle(cornerRadius: tileRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [.white.opacity(0.18), .white.opacity(0.04), .clear],
                                startPoint: .topLeading,
                                endPoint: .center
                            )
                        )
                        .frame(width: tileSize, height: tileSize)

                    // Avatar icon
                    Image(systemName: profile.isKids ? "teddybear.fill" : profile.avatarIcon)
                        .font(.system(size: profile.isKids ? 34 : 36, weight: .medium))
                        .foregroundStyle(.white.opacity(0.95))
                        .shadow(color: .black.opacity(0.2), radius: 4, y: 2)

                    // Selection ring
                    if isSelected {
                        RoundedRectangle(cornerRadius: tileRadius, style: .continuous)
                            .strokeBorder(.white, lineWidth: 2.5)
                            .frame(width: tileSize, height: tileSize)
                    }

                    // Edit badge
                    if isEditing {
                        ZStack {
                            Circle()
                                .fill(.ultraThinMaterial)
                                .frame(width: 26, height: 26)
                            Image(systemName: "pencil")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .offset(x: (tileSize / 2) - 8, y: -(tileSize / 2) + 8)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .scaleEffect(isSelected ? 1.05 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.65), value: selectedId)
                .rotationEffect(isEditing ? .degrees(index % 2 == 0 ? -1.2 : 1.2) : .zero)
                .animation(
                    isEditing
                        ? .easeInOut(duration: 0.12).repeatForever(autoreverses: true)
                        : .default,
                    value: isEditing
                )

                Text(profile.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
                    .frame(width: tileSize + 10)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 16)
            .animation(.easeOut(duration: 0.5).delay(0.12 + stagger), value: appeared)
        }
        .buttonStyle(.plain)
    }

    /// Uniform action tile for Add / Edit — premium glass style matching profile tiles
    private func actionTile(icon: String, label: String, index: Int, action: @escaping () -> Void) -> some View {
        let stagger = Double(index) * 0.06

        return Button(action: action) {
            VStack(spacing: 10) {
                ZStack {
                    // Tinted glass background
                    RoundedRectangle(cornerRadius: tileRadius, style: .continuous)
                        .fill(.white.opacity(0.06))
                        .frame(width: tileSize, height: tileSize)

                    // Subtle inner glow
                    RoundedRectangle(cornerRadius: tileRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [.white.opacity(0.06), .clear],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: tileSize, height: tileSize)

                    // Border
                    RoundedRectangle(cornerRadius: tileRadius, style: .continuous)
                        .strokeBorder(.white.opacity(0.08), lineWidth: 0.5)
                        .frame(width: tileSize, height: tileSize)

                    // Icon
                    Image(systemName: icon)
                        .font(.system(size: 26, weight: .light))
                        .foregroundStyle(.white.opacity(0.45))
                }

                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.45))
                    .frame(width: tileSize + 10)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 16)
            .animation(.easeOut(duration: 0.5).delay(0.12 + stagger), value: appeared)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Logic

    private func ensureDefaultProfile() {
        if profileManager.profiles.isEmpty {
            let name = authManager.currentUser?.displayName
                ?? authManager.currentUser?.email.components(separatedBy: "@").first
                ?? "User"
            profileManager.createDefault(name: name)
        }
    }

    private func selectProfile(_ profile: UserProfile) {
        let impact = UIImpactFeedbackGenerator(style: .medium)
        impact.impactOccurred()

        withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
            selectedId = profile.id
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            profileManager.select(profile)
            onProfileSelected()
        }
    }

    // MARK: - Sheets

    private var addProfileSheet: some View {
        AddProfileSheet(profileManager: profileManager, isPresented: $showAddSheet)
    }

    private func editProfileSheet(_ profile: UserProfile) -> some View {
        EditProfileSheet(profileManager: profileManager, profile: profile, editingProfile: $editingProfile)
    }
}

// MARK: - Animated Gradient Background (always-on fallback)

private struct AnimatedGradientBackground: View {
    @State private var animate = false

    var body: some View {
        ZStack {
            Color.black

            // Deep cinematic layered gradient — iOS 17 compatible
            ZStack {
                // Base layer: dark purple/blue
                LinearGradient(
                    colors: [
                        Color(red: 0.06, green: 0.02, blue: 0.14),
                        Color(red: 0.02, green: 0.04, blue: 0.12),
                        .black
                    ],
                    startPoint: animate ? .topLeading : .top,
                    endPoint: animate ? .bottomTrailing : .bottom
                )

                // Accent layer: warm undertone
                RadialGradient(
                    colors: [
                        Color(red: 0.15, green: 0.04, blue: 0.08).opacity(0.5),
                        .clear
                    ],
                    center: animate ? .bottomLeading : .topTrailing,
                    startRadius: 50,
                    endRadius: 350
                )
            }
            .opacity(0.85)
            .animation(.easeInOut(duration: 10).repeatForever(autoreverses: true), value: animate)
        }
        .ignoresSafeArea()
        .onAppear { animate = true }
    }
}

// MARK: - Backdrop ViewModel (Fixed Artwork Pipeline)

@MainActor
final class BackdropViewModel: ObservableObject {
    struct LoadedImage: Identifiable {
        let id: Int
        let image: UIImage
        let score: Int
    }

    @Published var loadedImages: [LoadedImage] = []
    @Published var activeIndex: Int = 0

    private var rotationTask: Task<Void, Never>?

    /// High-res loader — runs off main actor for concurrent downloads
    nonisolated private static func loadHighResImage(from url: URL) async -> UIImage? {
        do {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 12
            config.timeoutIntervalForResource = 20
            let session = URLSession(configuration: config)

            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse,
                  (200..<400).contains(http.statusCode),
                  let img = UIImage(data: data) else { return nil }

            // Reject tiny images (lowered threshold for IPTV poster art)
            guard img.size.width >= 80 && img.size.height >= 80 else { return nil }

            // Scale to max 1000px for crisp display
            let maxDim: CGFloat = 1000
            if img.size.width > maxDim || img.size.height > maxDim {
                let scale = maxDim / max(img.size.width, img.size.height)
                let newSize = CGSize(width: img.size.width * scale, height: img.size.height * scale)
                let renderer = UIGraphicsImageRenderer(size: newSize)
                return renderer.image { _ in img.draw(in: CGRect(origin: .zero, size: newSize)) }
            }
            return img
        } catch {
            return nil
        }
    }

    /// Score image for backdrop suitability — portrait images with good resolution rank highest
    nonisolated private static func scoreImage(_ img: UIImage) -> Int {
        var score = 0
        let w = img.size.width
        let h = img.size.height
        let ratio = h / w

        // Portrait or near-square preferred for phone portrait screen
        if ratio >= 1.2 { score += 40 }
        else if ratio >= 0.8 { score += 20 }

        // Resolution bonus
        let totalPx = w * h
        if totalPx >= 500_000 { score += 30 }
        else if totalPx >= 200_000 { score += 15 }

        // Larger dimension bonus
        if max(w, h) >= 600 { score += 20 }
        else if max(w, h) >= 400 { score += 10 }

        return score
    }

    init() {
        Task { await loadArtwork() }
    }

    deinit {
        rotationTask?.cancel()
    }

    private func loadArtwork() async {
        // Gather URLs (involves Supabase queries)
        let urls = await gatherArtworkURLs()
        guard !urls.isEmpty else { return }

        // Download & score images concurrently OFF the main actor
        let candidates: [(image: UIImage, score: Int)] = await withTaskGroup(of: (UIImage?, Int).self) { group in
            for url in urls {
                group.addTask(priority: .userInitiated) {
                    guard let img = await Self.loadHighResImage(from: url) else { return (nil, 0) }
                    let score = Self.scoreImage(img)
                    return (img, score)
                }
            }
            var results: [(UIImage, Int)] = []
            for await (img, score) in group {
                if let img { results.append((img, score)) }
            }
            return results.sorted(by: { $0.1 > $1.1 })
        }

        guard !candidates.isEmpty else { return }

        // Take top 6 best-quality images — update on main actor
        let best = candidates.prefix(6)
        self.loadedImages = best.enumerated().map { idx, pair in
            LoadedImage(id: idx, image: pair.image, score: pair.score)
        }
        self.activeIndex = 0

        if loadedImages.count > 1 {
            startRotation()
        }
    }

    /// Gather artwork URLs from user's playlists — movies first, then series.
    /// Uses a simple approach: grab items that have any image URL.
    private func gatherArtworkURLs() async -> [URL] {
        do {
            let supabase = SupabaseManager.shared.client
            let session = try await supabase.auth.session

            let playlists: [Playlist] = try await supabase
                .from("playlists")
                .select()
                .eq("user_id", value: session.user.id.uuidString)
                .execute()
                .value

            guard !playlists.isEmpty else { return [] }

            struct ArtworkItem: Decodable {
                let tvgLogo: String?
                let logoUrl: String?
                enum CodingKeys: String, CodingKey {
                    case tvgLogo = "tvg_logo"
                    case logoUrl = "logo_url"
                }
                var bestURL: URL? {
                    if let s = tvgLogo, !s.isEmpty, let u = URL(string: s) { return u }
                    if let s = logoUrl, !s.isEmpty, let u = URL(string: s) { return u }
                    return nil
                }
            }

            var collected: [URL] = []

            // Try movies first (best poster art), then series, then anything
            let contentTypes = ["movie", "series", "channel"]

            for contentType in contentTypes {
                guard collected.count < 20 else { break }

                for playlist in playlists.prefix(3) {
                    guard collected.count < 20 else { break }

                    // Query: items with tvg_logo OR logo_url set
                    let items: [ArtworkItem] = try await supabase
                        .from("playlist_items")
                        .select("tvg_logo, logo_url")
                        .eq("playlist_id", value: playlist.id.uuidString)
                        .eq("content_type", value: contentType)
                        .limit(50)
                        .execute()
                        .value

                    let urls = items.compactMap(\.bestURL)
                    collected.append(contentsOf: urls)
                }
            }

            guard !collected.isEmpty else { return [] }

            // Deduplicate, shuffle, take up to 20
            let unique = Array(Set(collected.map(\.absoluteString)))
                .compactMap(URL.init(string:))
                .shuffled()
                .prefix(20)

            return Array(unique)
        } catch {
            return []
        }
    }

    private func startRotation() {
        rotationTask = Task {
            try? await Task.sleep(for: .seconds(7))
            while !Task.isCancelled {
                let next = (activeIndex + 1) % loadedImages.count
                activeIndex = next
                try? await Task.sleep(for: .seconds(8))
            }
        }
    }
}

// MARK: - Add Profile Sheet

struct AddProfileSheet: View {
    @ObservedObject var profileManager: ProfileManager
    @Binding var isPresented: Bool
    @State private var name = ""
    @State private var isKids = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(spacing: 28) {
                    let colorIdx = profileManager.profiles.count % UserProfile.avatarColors.count
                    let colors = UserProfile.avatarColors[colorIdx]

                    ZStack {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color(red: colors.top.r, green: colors.top.g, blue: colors.top.b),
                                        Color(red: colors.bot.r, green: colors.bot.g, blue: colors.bot.b)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 90, height: 90)
                            .overlay(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [.white.opacity(0.15), .clear],
                                            startPoint: .topLeading,
                                            endPoint: .center
                                        )
                                    )
                            )
                            .shadow(color: .black.opacity(0.5), radius: 12, y: 6)

                        Image(systemName: isKids ? "teddybear.fill" : "face.smiling.inverse")
                            .font(.system(size: 36, weight: .medium))
                            .foregroundStyle(.white.opacity(0.95))
                    }
                    .padding(.top, 20)

                    TextField("", text: $name, prompt: Text("Name").foregroundStyle(.white.opacity(0.3)))
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(.white.opacity(0.08))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .strokeBorder(.white.opacity(0.12), lineWidth: 0.5)
                                )
                        )
                        .padding(.horizontal, 32)

                    Toggle(isOn: $isKids) {
                        HStack(spacing: 10) {
                            Image(systemName: "teddybear.fill")
                                .foregroundStyle(.yellow)
                            Text("Kids Profile")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.white)
                        }
                    }
                    .tint(.green)
                    .padding(.horizontal, 32)

                    Spacer()
                }
            }
            .navigationTitle("Add Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                        .foregroundStyle(.white.opacity(0.6))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let trimmed = name.trimmingCharacters(in: .whitespaces)
                        guard !trimmed.isEmpty else { return }
                        profileManager.addProfile(name: trimmed, isKids: isKids)
                        isPresented = false
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(.black)
    }
}

// MARK: - Edit Profile Sheet

struct EditProfileSheet: View {
    @ObservedObject var profileManager: ProfileManager
    let profile: UserProfile
    @Binding var editingProfile: UserProfile?
    @State private var name: String = ""
    @State private var colorIndex: Int = 0
    @State private var showDeleteConfirm = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(spacing: 28) {
                    let colors = UserProfile.avatarColors[colorIndex % UserProfile.avatarColors.count]

                    ZStack {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color(red: colors.top.r, green: colors.top.g, blue: colors.top.b),
                                        Color(red: colors.bot.r, green: colors.bot.g, blue: colors.bot.b)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 90, height: 90)
                            .overlay(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [.white.opacity(0.15), .clear],
                                            startPoint: .topLeading,
                                            endPoint: .center
                                        )
                                    )
                            )
                            .shadow(color: .black.opacity(0.5), radius: 12, y: 6)

                        Image(systemName: profile.isKids ? "teddybear.fill" : profile.avatarIcon)
                            .font(.system(size: 36, weight: .medium))
                            .foregroundStyle(.white.opacity(0.95))
                    }
                    .padding(.top, 20)

                    TextField("", text: $name, prompt: Text("Name").foregroundStyle(.white.opacity(0.3)))
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(.white.opacity(0.08))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .strokeBorder(.white.opacity(0.12), lineWidth: 0.5)
                                )
                        )
                        .padding(.horizontal, 32)

                    HStack(spacing: 12) {
                        ForEach(0..<UserProfile.avatarColors.count, id: \.self) { idx in
                            let c = UserProfile.avatarColors[idx]
                            Circle()
                                .fill(Color(red: c.top.r, green: c.top.g, blue: c.top.b))
                                .frame(width: 36, height: 36)
                                .overlay(
                                    Circle().strokeBorder(.white, lineWidth: colorIndex == idx ? 2.5 : 0)
                                )
                                .scaleEffect(colorIndex == idx ? 1.1 : 1.0)
                                .animation(.spring(response: 0.25), value: colorIndex)
                                .onTapGesture { colorIndex = idx }
                        }
                    }
                    .padding(.horizontal, 32)

                    Spacer()

                    if profileManager.profiles.count > 1 {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "trash")
                                Text("Delete Profile")
                            }
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.red.opacity(0.8))
                            .padding(.vertical, 12)
                        }
                        .padding(.bottom, 20)
                    }
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { editingProfile = nil }
                        .foregroundStyle(.white.opacity(0.6))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var updated = profile
                        updated.name = name.trimmingCharacters(in: .whitespaces)
                        updated.avatarColorIndex = colorIndex
                        profileManager.updateProfile(updated)
                        editingProfile = nil
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .alert("Delete Profile?", isPresented: $showDeleteConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    profileManager.deleteProfile(profile)
                    editingProfile = nil
                }
            } message: {
                Text("This will permanently remove \"\(profile.name)\".")
            }
        }
        .onAppear {
            name = profile.name
            colorIndex = profile.avatarColorIndex
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(.black)
    }
}
