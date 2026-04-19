import Foundation

/// Local sub-profile management (Netflix-style profiles under one account).
/// Stored in UserDefaults — no backend changes needed.
@MainActor
final class ProfileManager: ObservableObject {
    static let shared = ProfileManager()

    private let key = "ph_user_profiles"
    private let selectedKey = "ph_selected_profile"
    private let hasPickedKey = "ph_has_picked_profile"

    @Published var profiles: [UserProfile] = []
    @Published var selectedProfile: UserProfile?
    @Published var hasPicked: Bool = false

    private init() {
        load()
        hasPicked = UserDefaults.standard.bool(forKey: hasPickedKey)
        if let id = UserDefaults.standard.string(forKey: selectedKey),
           let uuid = UUID(uuidString: id) {
            selectedProfile = profiles.first(where: { $0.id == uuid })
        }
    }

    // MARK: - CRUD

    func createDefault(name: String) {
        guard profiles.isEmpty else { return }
        let profile = UserProfile(
            id: UUID(),
            name: name,
            avatarColorIndex: 0,
            avatarIcon: "face.smiling.inverse",
            isKids: false,
            createdAt: Date()
        )
        profiles.append(profile)
        save()
    }

    func addProfile(name: String, isKids: Bool) {
        guard profiles.count < 5 else { return }
        let colorIndex = profiles.count % UserProfile.avatarColors.count
        let profile = UserProfile(
            id: UUID(),
            name: name,
            avatarColorIndex: colorIndex,
            avatarIcon: isKids ? "teddybear.fill" : "face.smiling.inverse",
            isKids: isKids,
            createdAt: Date()
        )
        profiles.append(profile)
        save()
    }

    func deleteProfile(_ profile: UserProfile) {
        profiles.removeAll { $0.id == profile.id }
        if selectedProfile?.id == profile.id {
            selectedProfile = profiles.first
        }
        save()
    }

    func updateProfile(_ profile: UserProfile) {
        if let idx = profiles.firstIndex(where: { $0.id == profile.id }) {
            profiles[idx] = profile
            save()
        }
    }

    func select(_ profile: UserProfile) {
        selectedProfile = profile
        hasPicked = true
        UserDefaults.standard.set(profile.id.uuidString, forKey: selectedKey)
        UserDefaults.standard.set(true, forKey: hasPickedKey)
    }

    func reset() {
        selectedProfile = nil
        hasPicked = false
        UserDefaults.standard.removeObject(forKey: selectedKey)
        UserDefaults.standard.set(false, forKey: hasPickedKey)
    }

    // MARK: - Persistence

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([UserProfile].self, from: data) else { return }
        profiles = decoded
    }

    private func save() {
        if let data = try? JSONEncoder().encode(profiles) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

// MARK: - Model

struct UserProfile: Codable, Identifiable, Equatable {
    let id: UUID
    var name: String
    var avatarColorIndex: Int
    var avatarIcon: String
    var isKids: Bool
    var createdAt: Date

    static let avatarColors: [(top: (r: Double, g: Double, b: Double), bot: (r: Double, g: Double, b: Double))] = [
        (top: (0.22, 0.50, 0.95), bot: (0.15, 0.35, 0.80)),   // Blue
        (top: (0.92, 0.22, 0.22), bot: (0.75, 0.12, 0.12)),   // Red
        (top: (0.18, 0.80, 0.45), bot: (0.10, 0.60, 0.30)),   // Green
        (top: (0.60, 0.25, 0.85), bot: (0.45, 0.15, 0.70)),   // Purple
        (top: (0.95, 0.55, 0.15), bot: (0.80, 0.40, 0.08)),   // Orange
    ]
}
