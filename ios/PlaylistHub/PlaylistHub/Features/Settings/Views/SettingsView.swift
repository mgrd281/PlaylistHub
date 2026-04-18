import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var showSignOutConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Profile card
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(.red.opacity(0.12))
                                .frame(width: 52, height: 52)
                            Text(initials)
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.red)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            if let name = authManager.currentUser?.displayName, !name.isEmpty {
                                Text(name)
                                    .font(.subheadline.weight(.semibold))
                            }
                            Text(authManager.currentUser?.email ?? "")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(16)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 20)
                    .padding(.top, 8)

                    // Info section
                    VStack(spacing: 0) {
                        settingsRow(icon: "info.circle", title: "Version", trailing: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
                        Divider().padding(.leading, 44)
                        settingsRow(icon: "server.rack", title: "Backend", trailing: "Supabase")
                        Divider().padding(.leading, 44)
                        settingsRow(icon: "play.rectangle", title: "Playback", trailing: "HLS / MP4")
                        Divider().padding(.leading, 44)
                        HStack(spacing: 10) {
                            Image(systemName: "arrow.triangle.branch")
                                .font(.system(size: 14))
                                .foregroundStyle(.secondary)
                                .frame(width: 24)
                            Text("Stream Proxy")
                                .font(.subheadline)
                            Spacer()
                            Text("Active")
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(.green.opacity(0.15))
                                .foregroundStyle(.green)
                                .clipShape(Capsule())
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 13)
                    }
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 20)

                    // Sign out
                    Button(role: .destructive) {
                        showSignOutConfirm = true
                    } label: {
                        HStack {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 14))
                            Text("Sign Out")
                                .font(.subheadline.weight(.medium))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .padding(.horizontal, 20)
                }
            }
            .navigationTitle("Settings")
            .alert("Sign Out?", isPresented: $showSignOutConfirm) {
                Button("Sign Out", role: .destructive) {
                    Task { await authManager.signOut() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll need to sign in again to access your playlists.")
            }
        }
    }

    private func settingsRow(icon: String, title: String, trailing: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
                .frame(width: 24)
            Text(title)
                .font(.subheadline)
            Spacer()
            Text(trailing)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
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
}

#Preview {
    SettingsView()
        .environmentObject(AuthManager.shared)
}
