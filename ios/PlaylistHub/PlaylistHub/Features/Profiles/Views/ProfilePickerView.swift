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
    @State private var showEditSheet = false
    @State private var editingProfile: UserProfile?

    let onProfileSelected: () -> Void

    var body: some View {
        ZStack {
            // Layer 1: Cinematic rotating backdrop
            backdropLayer

            // Layer 2: Dark cinematic overlay
            overlayGradient

            // Layer 3: Content
            VStack(spacing: 0) {
                Spacer().frame(height: 60)
                logoHeader
                Spacer()
                titleSection
                    .padding(.bottom, 32)
                profileGrid
                    .padding(.bottom, 28)
                actionButtons
                    .padding(.bottom, 16)
                editToggle
                Spacer().frame(height: 50)
            }
            .padding(.horizontal, 24)
        }
        .ignoresSafeArea()
        .onAppear {
            ensureDefaultProfile()
            withAnimation(.easeOut(duration: 0.8).delay(0.1)) {
                appeared = true
            }
        }
        .sheet(isPresented: $showAddSheet) { addProfileSheet }
        .sheet(item: $editingProfile) { profile in
            editProfileSheet(profile)
        }
    }

    // MARK: - Backdrop

    private var backdropLayer: some View {
        ZStack {
            Color.black

            ForEach(artworkVM.images.indices, id: \.self) { idx in
                if let img = artworkVM.images[idx] {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                        .opacity(artworkVM.currentIndex == idx ? 1 : 0)
                        .animation(.easeInOut(duration: 1.5), value: artworkVM.currentIndex)
                }
            }
        }
        .ignoresSafeArea()
    }

    private var overlayGradient: some View {
        ZStack {
            // Top fade
            LinearGradient(
                colors: [.black.opacity(0.7), .clear],
                startPoint: .top,
                endPoint: .center
            )

            // Bottom heavy fade
            LinearGradient(
                colors: [.clear, .black.opacity(0.85), .black],
                startPoint: .center,
                endPoint: .bottom
            )

            // Overall darken
            Color.black.opacity(0.35)
        }
        .ignoresSafeArea()
    }

    // MARK: - Logo

    private var logoHeader: some View {
        HStack {
            Image(systemName: "play.rectangle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(
                    LinearGradient(
                        colors: [themeManager.accentColor, themeManager.accentColor.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : -10)

            Text("PlaylistHub")
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.9))
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : -10)

            Spacer()
        }
    }

    // MARK: - Title

    private var titleSection: some View {
        Text("Who's watching?")
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(.white)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 15)
    }

    // MARK: - Profile Grid

    private var profileGrid: some View {
        let columns = gridColumns
        return LazyVGrid(columns: columns, spacing: 20) {
            ForEach(Array(profileManager.profiles.enumerated()), id: \.element.id) { index, profile in
                profileCard(profile, index: index)
            }
        }
        .frame(maxWidth: 360)
    }

    private var gridColumns: [GridItem] {
        let count = min(profileManager.profiles.count, 3)
        return Array(repeating: GridItem(.flexible(), spacing: 16), count: max(count, 1))
    }

    private func profileCard(_ profile: UserProfile, index: Int) -> some View {
        let colors = UserProfile.avatarColors[profile.avatarColorIndex % UserProfile.avatarColors.count]
        let delay = Double(index) * 0.08

        return Button {
            guard !isEditing else {
                editingProfile = profile
                return
            }
            selectProfile(profile)
        } label: {
            VStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
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
                        .frame(width: 84, height: 84)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(.white.opacity(selectedId == profile.id ? 0.8 : 0), lineWidth: 2.5)
                        )
                        .shadow(color: .black.opacity(0.4), radius: 12, y: 6)

                    Image(systemName: profile.isKids ? "teddybear.fill" : profile.avatarIcon)
                        .font(.system(size: profile.isKids ? 32 : 34, weight: .medium))
                        .foregroundStyle(.white.opacity(0.95))

                    // Edit badge
                    if isEditing {
                        ZStack {
                            Circle()
                                .fill(.ultraThinMaterial)
                                .frame(width: 28, height: 28)
                            Image(systemName: "pencil")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .offset(x: 32, y: -32)
                        .transition(.scale)
                    }
                }
                .scaleEffect(selectedId == profile.id ? 1.08 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: selectedId)
                .rotationEffect(isEditing ? .degrees([-1.5, 1.5][index % 2]) : .zero)
                .animation(
                    isEditing
                        ? .easeInOut(duration: 0.12).repeatForever(autoreverses: true)
                        : .default,
                    value: isEditing
                )

                Text(profile.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 20)
            .animation(.easeOut(duration: 0.5).delay(0.2 + delay), value: appeared)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 24) {
            if profileManager.profiles.count < 5 {
                actionButton(icon: "plus", label: "Add") {
                    showAddSheet = true
                }
            }
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 12)
        .animation(.easeOut(duration: 0.4).delay(0.5), value: appeared)
    }

    private func actionButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(.white.opacity(0.08))
                        .frame(width: 68, height: 68)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(.white.opacity(0.15), lineWidth: 1)
                        )
                    Image(systemName: icon)
                        .font(.system(size: 26, weight: .light))
                        .foregroundStyle(.white.opacity(0.6))
                }
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Edit Toggle

    private var editToggle: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                isEditing.toggle()
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isEditing ? "checkmark" : "pencil")
                    .font(.system(size: 12, weight: .semibold))
                Text(isEditing ? "Done" : "Edit Profiles")
                    .font(.system(size: 14, weight: .medium))
            }
            .foregroundStyle(.white.opacity(0.5))
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(
                Capsule()
                    .fill(.white.opacity(0.06))
                    .overlay(Capsule().strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
            )
        }
        .buttonStyle(.plain)
        .opacity(appeared ? 1 : 0)
        .animation(.easeOut(duration: 0.3).delay(0.6), value: appeared)
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
        let impactFeedback = UIImpactFeedbackGenerator(style: .medium)
        impactFeedback.impactOccurred()

        withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
            selectedId = profile.id
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            profileManager.select(profile)
            onProfileSelected()
        }
    }

    // MARK: - Add Profile Sheet

    private var addProfileSheet: some View {
        AddProfileSheet(profileManager: profileManager, isPresented: $showAddSheet)
    }

    private func editProfileSheet(_ profile: UserProfile) -> some View {
        EditProfileSheet(profileManager: profileManager, profile: profile, editingProfile: $editingProfile)
    }
}

// MARK: - Backdrop ViewModel

@MainActor
final class BackdropViewModel: ObservableObject {
    @Published var images: [UIImage?] = [nil, nil, nil, nil, nil, nil, nil, nil]
    @Published var currentIndex: Int = 0

    private var urls: [URL] = []
    private var rotationTask: Task<Void, Never>?

    init() {
        Task { await loadArtwork() }
    }

    deinit {
        rotationTask?.cancel()
    }

    private func loadArtwork() async {
        // Fetch movie items with poster URLs from user's playlists
        do {
            let supabase = SupabaseManager.shared.client
            let session = try await supabase.auth.session

            // Get user's playlists
            let playlists: [Playlist] = try await supabase
                .from("playlists")
                .select()
                .eq("user_id", value: session.user.id.uuidString)
                .execute()
                .value

            guard !playlists.isEmpty else { return }

            // Fetch movie items that have poster images
            struct PosterItem: Decodable {
                let tvgLogo: String?
                let logoUrl: String?

                enum CodingKeys: String, CodingKey {
                    case tvgLogo = "tvg_logo"
                    case logoUrl = "logo_url"
                }
            }

            var allPosters: [URL] = []
            for playlist in playlists.prefix(3) {
                let items: [PosterItem] = try await supabase
                    .from("playlist_items")
                    .select("tvg_logo, logo_url")
                    .eq("playlist_id", value: playlist.id.uuidString)
                    .eq("content_type", value: "movie")
                    .not("tvg_logo", operator: .is, value: "null")
                    .limit(40)
                    .execute()
                    .value

                for item in items {
                    if let logo = item.tvgLogo, let url = URL(string: logo) {
                        allPosters.append(url)
                    } else if let logo = item.logoUrl, let url = URL(string: logo) {
                        allPosters.append(url)
                    }
                }
            }

            guard !allPosters.isEmpty else { return }

            // Shuffle and take up to 8
            urls = Array(allPosters.shuffled().prefix(8))

            // Preload all images concurrently
            await withTaskGroup(of: (Int, UIImage?).self) { group in
                for (idx, url) in urls.enumerated() {
                    group.addTask {
                        let img = await ImageCacheStore.shared.load(url: url)
                        return (idx, img)
                    }
                }
                for await (idx, img) in group {
                    images[idx] = img
                }
            }

            // Start rotation
            startRotation()
        } catch {
            // Silently fail — screen still looks great with black background
        }
    }

    private func startRotation() {
        let validCount = images.compactMap({ $0 }).count
        guard validCount > 1 else { return }

        rotationTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(7))
                guard !Task.isCancelled else { break }
                let next = (currentIndex + 1) % images.count
                // Skip nil slots
                if images[next] != nil {
                    currentIndex = next
                } else {
                    // Find next valid
                    for offset in 1..<images.count {
                        let candidate = (currentIndex + offset) % images.count
                        if images[candidate] != nil {
                            currentIndex = candidate
                            break
                        }
                    }
                }
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
                    // Preview avatar
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
                            .shadow(color: .black.opacity(0.5), radius: 16, y: 8)

                        Image(systemName: isKids ? "teddybear.fill" : "face.smiling.inverse")
                            .font(.system(size: 40, weight: .medium))
                            .foregroundStyle(.white.opacity(0.95))
                    }
                    .padding(.top, 20)

                    // Name field
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

                    // Kids toggle
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
                    // Avatar preview
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
                            .shadow(color: .black.opacity(0.5), radius: 16, y: 8)

                        Image(systemName: profile.isKids ? "teddybear.fill" : profile.avatarIcon)
                            .font(.system(size: 40, weight: .medium))
                            .foregroundStyle(.white.opacity(0.95))
                    }
                    .padding(.top, 20)

                    // Name field
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

                    // Color picker
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

                    // Delete button
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
