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
                // Layer 1: Cinematic rotating backdrop
                backdropLayer(size: geo.size)

                // Layer 2: Multi-layer cinematic overlay
                cinematicOverlay

                // Layer 3: Content
                VStack(spacing: 0) {
                    // Top logo
                    logoHeader
                        .padding(.top, geo.safeAreaInsets.top + 16)
                        .padding(.horizontal, 28)

                    Spacer()

                    // Title
                    VStack(spacing: 6) {
                        Text("Who's watching?")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                            .opacity(appeared ? 1 : 0)
                            .offset(y: appeared ? 0 : 18)
                    }
                    .padding(.bottom, 40)

                    // Profile grid
                    profileGrid
                        .padding(.horizontal, 28)
                        .padding(.bottom, 32)

                    // Add profile button
                    if profileManager.profiles.count < 5 {
                        addProfileButton
                            .padding(.bottom, 14)
                    }

                    // Edit toggle
                    editToggle
                        .padding(.bottom, geo.safeAreaInsets.bottom + 24)
                }
            }
        }
        .ignoresSafeArea()
        .onAppear {
            ensureDefaultProfile()
            withAnimation(.easeOut(duration: 0.9).delay(0.15)) {
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
            // Base: premium animated gradient (always visible as fallback)
            AnimatedGradientBackground()

            // Artwork images with crossfade
            ForEach(artworkVM.loadedImages.indices, id: \.self) { idx in
                let entry = artworkVM.loadedImages[idx]
                Image(uiImage: entry.image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size.width, height: size.height)
                    .clipped()
                    // Ken Burns: subtle slow zoom
                    .scaleEffect(artworkVM.activeIndex == idx ? 1.08 : 1.0)
                    .animation(.easeInOut(duration: 8), value: artworkVM.activeIndex)
                    .opacity(artworkVM.activeIndex == idx ? 1 : 0)
                    .animation(.easeInOut(duration: 1.8), value: artworkVM.activeIndex)
            }
        }
    }

    private var cinematicOverlay: some View {
        ZStack {
            // Top edge vignette
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.75), location: 0),
                    .init(color: .black.opacity(0.3), location: 0.25),
                    .init(color: .clear, location: 0.45),
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Bottom heavy fade for profile area
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0.0),
                    .init(color: .black.opacity(0.15), location: 0.3),
                    .init(color: .black.opacity(0.75), location: 0.55),
                    .init(color: .black.opacity(0.92), location: 0.72),
                    .init(color: .black, location: 0.85),
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Side vignettes for depth
            RadialGradient(
                colors: [.clear, .black.opacity(0.3)],
                center: .center,
                startRadius: 180,
                endRadius: 500
            )
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - Logo

    private var logoHeader: some View {
        HStack(spacing: 10) {
            Image(systemName: "play.rectangle.fill")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(
                    LinearGradient(
                        colors: [themeManager.accentColor, themeManager.accentColor.opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: themeManager.accentColor.opacity(0.4), radius: 8, y: 2)

            Text("PlaylistHub")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Spacer()
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : -12)
        .animation(.easeOut(duration: 0.6).delay(0.1), value: appeared)
    }

    // MARK: - Profile Grid

    private var profileGrid: some View {
        let cols = adaptiveColumns
        return LazyVGrid(columns: cols, spacing: 24) {
            ForEach(Array(profileManager.profiles.enumerated()), id: \.element.id) { index, profile in
                profileCard(profile, index: index)
            }
        }
        .frame(maxWidth: 380)
    }

    private var adaptiveColumns: [GridItem] {
        let count = min(profileManager.profiles.count, 3)
        return Array(repeating: GridItem(.flexible(), spacing: 20), count: max(count, 1))
    }

    private func profileCard(_ profile: UserProfile, index: Int) -> some View {
        let colors = UserProfile.avatarColors[profile.avatarColorIndex % UserProfile.avatarColors.count]
        let stagger = Double(index) * 0.1

        return Button {
            guard !isEditing else {
                editingProfile = profile
                return
            }
            selectProfile(profile)
        } label: {
            VStack(spacing: 12) {
                ZStack {
                    // Card background with glass effect
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
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
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [.white.opacity(0.2), .clear],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .strokeBorder(
                                    .white.opacity(selectedId == profile.id ? 0.9 : 0.15),
                                    lineWidth: selectedId == profile.id ? 2.5 : 0.5
                                )
                        )
                        .shadow(color: Color(red: colors.top.r, green: colors.top.g, blue: colors.top.b).opacity(0.35), radius: 16, y: 8)
                        .shadow(color: .black.opacity(0.5), radius: 20, y: 10)

                    // Icon
                    Image(systemName: profile.isKids ? "teddybear.fill" : profile.avatarIcon)
                        .font(.system(size: profile.isKids ? 34 : 36, weight: .medium))
                        .foregroundStyle(.white.opacity(0.95))
                        .shadow(color: .black.opacity(0.3), radius: 4, y: 2)

                    // Edit badge overlay
                    if isEditing {
                        ZStack {
                            Circle()
                                .fill(.ultraThinMaterial)
                                .frame(width: 30, height: 30)
                                .shadow(color: .black.opacity(0.3), radius: 4)
                            Image(systemName: "pencil")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .offset(x: 35, y: -35)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .scaleEffect(selectedId == profile.id ? 1.1 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: selectedId)
                .rotationEffect(isEditing ? .degrees(index % 2 == 0 ? -1.5 : 1.5) : .zero)
                .animation(
                    isEditing
                        ? .easeInOut(duration: 0.15).repeatForever(autoreverses: true)
                        : .default,
                    value: isEditing
                )

                // Name
                Text(profile.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
                    .shadow(color: .black.opacity(0.5), radius: 4, y: 1)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 25)
            .animation(.easeOut(duration: 0.6).delay(0.25 + stagger), value: appeared)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Add Profile Button

    private var addProfileButton: some View {
        Button {
            showAddSheet = true
        } label: {
            VStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.white.opacity(0.06))
                        .frame(width: 72, height: 72)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .strokeBorder(.white.opacity(0.12), lineWidth: 1)
                        )

                    Image(systemName: "plus")
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(.white.opacity(0.5))
                }

                Text("Add Profile")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.45))
            }
        }
        .buttonStyle(.plain)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 15)
        .animation(.easeOut(duration: 0.5).delay(0.55), value: appeared)
    }

    // MARK: - Edit Toggle

    private var editToggle: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                isEditing.toggle()
            }
        } label: {
            HStack(spacing: 7) {
                Image(systemName: isEditing ? "checkmark" : "pencil")
                    .font(.system(size: 12, weight: .semibold))
                Text(isEditing ? "Done" : "Manage Profiles")
                    .font(.system(size: 14, weight: .medium))
            }
            .foregroundStyle(.white.opacity(0.45))
            .padding(.horizontal, 22)
            .padding(.vertical, 11)
            .background(
                Capsule()
                    .fill(.white.opacity(0.05))
                    .overlay(Capsule().strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
            )
        }
        .buttonStyle(.plain)
        .opacity(appeared ? 1 : 0)
        .animation(.easeOut(duration: 0.4).delay(0.65), value: appeared)
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
    }

    @Published var loadedImages: [LoadedImage] = []
    @Published var activeIndex: Int = 0

    private var rotationTask: Task<Void, Never>?

    /// Dedicated high-res image loader that bypasses the 300px poster cache.
    /// Loads at up to 800px for crisp full-screen mobile backdrops.
    private static func loadHighResImage(from url: URL) async -> UIImage? {
        do {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 12
            config.timeoutIntervalForResource = 20
            let session = URLSession(configuration: config)

            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse,
                  (200..<400).contains(http.statusCode),
                  let img = UIImage(data: data) else { return nil }

            // Scale to max 800px — high enough for mobile full-screen, saves memory
            let maxDim: CGFloat = 800
            if img.size.width > maxDim || img.size.height > maxDim {
                let scale = maxDim / max(img.size.width, img.size.height)
                let newSize = CGSize(width: img.size.width * scale, height: img.size.height * scale)
                let renderer = UIGraphicsImageRenderer(size: newSize)
                return renderer.image { _ in img.draw(in: CGRect(origin: .zero, size: newSize)) }
            }
            // Accept images 150px+ — anything smaller is a bad thumbnail
            guard img.size.width >= 150 && img.size.height >= 150 else { return nil }
            return img
        } catch {
            return nil
        }
    }

    init() {
        Task { await loadArtwork() }
    }

    deinit {
        rotationTask?.cancel()
    }

    private func loadArtwork() async {
        let urls = await gatherArtworkURLs()
        guard !urls.isEmpty else { return }

        // Load images concurrently, collect successful ones
        let results: [(Int, UIImage)] = await withTaskGroup(of: (Int, UIImage?).self) { group in
            for (idx, url) in urls.enumerated() {
                group.addTask {
                    let img = await Self.loadHighResImage(from: url)
                    return (idx, img)
                }
            }
            var loaded: [(Int, UIImage)] = []
            for await (idx, img) in group {
                if let img { loaded.append((idx, img)) }
            }
            return loaded.sorted(by: { $0.0 < $1.0 })
        }

        guard !results.isEmpty else { return }

        // Publish loaded images
        loadedImages = results.enumerated().map { offset, pair in
            LoadedImage(id: offset, image: pair.1)
        }
        activeIndex = 0

        // Start rotation if we have multiple
        if loadedImages.count > 1 {
            startRotation()
        }
    }

    /// Multi-source artwork gathering: movies → series → channels.
    /// Fetches the best available poster/logo URLs from the user's catalog.
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

            struct PosterItem: Decodable {
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

            // Phase 1: Movie posters (best quality — typically full poster art)
            for playlist in playlists.prefix(3) {
                let items: [PosterItem] = try await supabase
                    .from("playlist_items")
                    .select("tvg_logo, logo_url")
                    .eq("playlist_id", value: playlist.id.uuidString)
                    .eq("content_type", value: "movie")
                    .not("tvg_logo", operator: .is, value: "null")
                    .limit(60)
                    .execute()
                    .value

                collected.append(contentsOf: items.compactMap(\.bestURL))
            }

            // Phase 2: Series posters if not enough movies
            if collected.count < 8 {
                for playlist in playlists.prefix(2) {
                    let items: [PosterItem] = try await supabase
                        .from("playlist_items")
                        .select("tvg_logo, logo_url")
                        .eq("playlist_id", value: playlist.id.uuidString)
                        .eq("content_type", value: "series")
                        .not("tvg_logo", operator: .is, value: "null")
                        .limit(30)
                        .execute()
                        .value

                    collected.append(contentsOf: items.compactMap(\.bestURL))
                }
            }

            // Phase 3: Channel logos as last resort
            if collected.count < 4 {
                for playlist in playlists.prefix(1) {
                    let items: [PosterItem] = try await supabase
                        .from("playlist_items")
                        .select("tvg_logo, logo_url")
                        .eq("playlist_id", value: playlist.id.uuidString)
                        .eq("content_type", value: "channel")
                        .not("tvg_logo", operator: .is, value: "null")
                        .limit(20)
                        .execute()
                        .value

                    collected.append(contentsOf: items.compactMap(\.bestURL))
                }
            }

            // Deduplicate, shuffle, take up to 10
            let unique = Array(Set(collected.map(\.absoluteString)))
                .compactMap(URL.init(string:))
                .shuffled()
                .prefix(10)

            return Array(unique)
        } catch {
            return []
        }
    }

    private func startRotation() {
        rotationTask = Task {
            // Small initial delay so first image is visible
            try? await Task.sleep(for: .seconds(6))
            while !Task.isCancelled {
                let next = (activeIndex + 1) % loadedImages.count
                activeIndex = next
                try? await Task.sleep(for: .seconds(7))
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
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
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
                            .frame(width: 100, height: 100)
                            .overlay(
                                RoundedRectangle(cornerRadius: 24, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [.white.opacity(0.2), .clear],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                            )
                            .shadow(color: .black.opacity(0.5), radius: 16, y: 8)

                        Image(systemName: isKids ? "teddybear.fill" : "face.smiling.inverse")
                            .font(.system(size: 40, weight: .medium))
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
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
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
                            .frame(width: 100, height: 100)
                            .overlay(
                                RoundedRectangle(cornerRadius: 24, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [.white.opacity(0.2), .clear],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                            )
                            .shadow(color: .black.opacity(0.5), radius: 16, y: 8)

                        Image(systemName: profile.isKids ? "teddybear.fill" : profile.avatarIcon)
                            .font(.system(size: 40, weight: .medium))
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
