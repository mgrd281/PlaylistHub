import SwiftUI

/// Admin-only view for managing channel/source URLs across playlists.
/// Shows source URLs, stream URL samples, and URL protection status.
struct AdminURLManagerView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var themeManager: ThemeManager
    @StateObject private var viewModel = AdminURLManagerViewModel()

    private var accent: Color { themeManager.accentColor }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                // Header
                HStack(spacing: 10) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(.red.opacity(0.12))
                            .frame(width: 44, height: 44)
                        Image(systemName: "link.badge.plus")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.red)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("URL Management")
                            .font(.headline)
                        Text("Source URLs, stream URLs & protection")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)

                if viewModel.isLoading {
                    ProgressView()
                        .padding(.top, 40)
                } else if viewModel.playlists.isEmpty {
                    emptyState
                } else {
                    // Playlist cards with URL info
                    ForEach(viewModel.playlists) { playlist in
                        playlistURLCard(playlist)
                    }

                    // URL Protection status
                    protectionCard
                }
            }
            .padding(.bottom, 40)
        }
        .navigationTitle("URL Manager")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.load()
        }
        .refreshable {
            await viewModel.load()
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundStyle(.quaternary)
            Text("No Playlists")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .padding(.top, 60)
    }

    // MARK: - Playlist URL Card

    private func playlistURLCard(_ playlist: PlaylistURLInfo) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Card header
            HStack(spacing: 10) {
                Image(systemName: "list.bullet.rectangle.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(accent)
                VStack(alignment: .leading, spacing: 1) {
                    Text(playlist.name)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1)
                    Text("\(playlist.totalItems) items · \(playlist.type)")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                statusPill(playlist.status)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            Divider().padding(.leading, 14)

            // Source URL
            urlRow(
                label: "Source URL",
                icon: "globe",
                url: playlist.sourceUrl,
                color: .blue
            )

            if !playlist.sampleStreamURLs.isEmpty {
                Divider().padding(.leading, 14)

                // Sample stream URLs
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(.green)
                        Text("Sample Stream URLs")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.secondary)
                    }

                    ForEach(Array(playlist.sampleStreamURLs.enumerated()), id: \.offset) { _, url in
                        Text(url)
                            .font(.system(size: 10).monospaced())
                            .foregroundStyle(.primary.opacity(0.8))
                            .lineLimit(2)
                            .truncationMode(.middle)
                            .textSelection(.enabled)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }

            // Channel counts breakdown
            Divider().padding(.leading, 14)

            HStack(spacing: 16) {
                countBadge("Channels", count: playlist.channelsCount, color: .blue)
                countBadge("Movies", count: playlist.moviesCount, color: .purple)
                countBadge("Series", count: playlist.seriesCount, color: .orange)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .background(Color(.systemGray6).opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 20)
    }

    private func urlRow(label: String, icon: String, url: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundStyle(color)
                Text(label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    UIPasteboard.general.string = url
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 10))
                        .foregroundStyle(accent)
                }
                .buttonStyle(.plain)
            }
            Text(url)
                .font(.system(size: 10).monospaced())
                .foregroundStyle(.primary.opacity(0.8))
                .lineLimit(3)
                .truncationMode(.middle)
                .textSelection(.enabled)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func countBadge(_ label: String, count: Int, color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(count)")
                .font(.system(size: 14, weight: .bold).monospacedDigit())
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
    }

    private func statusPill(_ status: String) -> some View {
        let color: Color = status == "active" ? .green : status == "scanning" ? .orange : .red
        return Text(status.uppercased())
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }

    // MARK: - Protection Card

    private var protectionCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(.orange)
                Text("URL Protection")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()

                if viewModel.protectionEnabled {
                    HStack(spacing: 4) {
                        Circle().fill(.green).frame(width: 6, height: 6)
                        Text("ENABLED")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.green)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.green.opacity(0.12))
                    .clipShape(Capsule())
                } else {
                    HStack(spacing: 4) {
                        Circle().fill(.red).frame(width: 6, height: 6)
                        Text("NOT SET")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.red)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.red.opacity(0.12))
                    .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            Divider().padding(.leading, 14)

            VStack(alignment: .leading, spacing: 4) {
                Text("Password protection for raw stream URL visibility.")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                Text("As admin, you always have full URL access regardless of protection status.")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .background(Color(.systemGray6).opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 20)
    }
}

// MARK: - ViewModel

@MainActor
final class AdminURLManagerViewModel: ObservableObject {
    @Published var playlists: [PlaylistURLInfo] = []
    @Published var protectionEnabled = false
    @Published var isLoading = false

    private var supabase: SupabaseClient { SupabaseManager.shared.client }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            // Fetch playlists with source URLs
            let playlistData: [Playlist] = try await supabase
                .from("playlists")
                .select()
                .order("created_at", ascending: false)
                .execute()
                .value

            var results: [PlaylistURLInfo] = []
            for playlist in playlistData {
                // Fetch a few sample stream URLs from each playlist
                let sampleItems: [PlaylistItem] = try await supabase
                    .from("playlist_items")
                    .select()
                    .eq("playlist_id", value: playlist.id.uuidString)
                    .limit(3)
                    .execute()
                    .value

                results.append(PlaylistURLInfo(
                    id: playlist.id,
                    name: playlist.name,
                    sourceUrl: playlist.sourceUrl,
                    type: playlist.type.rawValue,
                    status: playlist.status.rawValue,
                    totalItems: playlist.totalItems,
                    channelsCount: playlist.channelsCount,
                    moviesCount: playlist.moviesCount,
                    seriesCount: playlist.seriesCount,
                    sampleStreamURLs: sampleItems.map(\.streamUrl)
                ))
            }
            playlists = results

            // Check protection status
            await URLProtectionManager.shared.checkStatus()
            protectionEnabled = URLProtectionManager.shared.isProtected
        } catch {
            // Silently handle — view shows empty state
        }
    }
}

// MARK: - Model

struct PlaylistURLInfo: Identifiable {
    let id: UUID
    let name: String
    let sourceUrl: String
    let type: String
    let status: String
    let totalItems: Int
    let channelsCount: Int
    let moviesCount: Int
    let seriesCount: Int
    let sampleStreamURLs: [String]
}
