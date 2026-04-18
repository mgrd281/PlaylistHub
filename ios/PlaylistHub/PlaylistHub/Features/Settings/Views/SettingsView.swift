import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var showSignOutConfirm = false

    var body: some View {
        NavigationStack {
            List {
                // Profile section
                Section {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Color.red.opacity(0.15))
                                .frame(width: 56, height: 56)
                            Text(initials)
                                .font(.title2.weight(.semibold))
                                .foregroundStyle(.red)
                        }

                        VStack(alignment: .leading, spacing: 3) {
                            if let name = authManager.currentUser?.displayName, !name.isEmpty {
                                Text(name)
                                    .font(.headline)
                            }
                            Text(authManager.currentUser?.email ?? "")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                // App section
                Section("App") {
                    HStack {
                        Label("Version", systemImage: "info.circle")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Label("Backend", systemImage: "server.rack")
                        Spacer()
                        Text("Supabase")
                            .foregroundStyle(.secondary)
                    }
                }

                // Streaming section
                Section("Streaming") {
                    HStack {
                        Label("Stream Proxy", systemImage: "arrow.triangle.branch")
                        Spacer()
                        Text("Active")
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(.green.opacity(0.15))
                            .foregroundStyle(.green)
                            .clipShape(Capsule())
                    }

                    HStack {
                        Label("Playback", systemImage: "play.rectangle")
                        Spacer()
                        Text("HLS / MP4")
                            .foregroundStyle(.secondary)
                    }
                }

                // Account section
                Section {
                    Button(role: .destructive) {
                        showSignOutConfirm = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
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
