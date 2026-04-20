import SwiftUI

struct FavoriteChannelsView: View {
    @StateObject private var favorites = ChannelFavoritesManager.shared
    @EnvironmentObject private var themeManager: ThemeManager
    @State private var showClearConfirm = false

    private var accent: Color { themeManager.accentColor }
    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        Group {
            if favorites.sortedFavorites.isEmpty {
                emptyState
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(favorites.sortedFavorites, id: \.streamURL) { entry in
                            FavoriteChannelCard(entry: entry, accent: accent) {
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    favorites.remove(entry.streamURL)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 40)
                }
            }
        }
        .navigationTitle("Favorite Channels")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if favorites.count > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showClearConfirm = true
                    } label: {
                        Text("Clear All")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.red)
                    }
                }
            }
        }
        .alert("Remove All Favorites?", isPresented: $showClearConfirm) {
            Button("Remove All", role: .destructive) {
                withAnimation {
                    for entry in favorites.sortedFavorites {
                        favorites.remove(entry.streamURL)
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will remove all \(favorites.count) channels from your favorites.")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "heart")
                .font(.system(size: 44, weight: .ultraLight))
                .foregroundStyle(.quaternary)
            VStack(spacing: 6) {
                Text("No favorite channels")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                Text("Tap ❤️ on Live TV channels to add them here")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
            }
            Spacer()
        }
        .padding(.horizontal, 40)
    }
}

// MARK: - Favorite Channel Card

private struct FavoriteChannelCard: View {
    let entry: ChannelFavoritesManager.FavoriteEntry
    let accent: Color
    let onRemove: () -> Void

    var body: some View {
        ZStack {
            // Clean dark surface (no stretched background image)
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))

            VStack(spacing: 8) {
                // Channel logo (fit, not fill)
                if let urlStr = entry.logoURL, let url = URL(string: urlStr) {
                    CachedAsyncImage(url: url) {
                        Image(systemName: "tv.fill")
                            .font(.system(size: 24, weight: .light))
                            .foregroundStyle(.tertiary)
                    }
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 36)
                } else {
                    Image(systemName: "tv.fill")
                        .font(.system(size: 24, weight: .light))
                        .foregroundStyle(.tertiary)
                }

                Text(entry.channelName)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)

                if let group = entry.groupTitle {
                    Text(group)
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 12)
        }
        .frame(height: 130)
        .overlay(alignment: .topTrailing) {
            Button(action: onRemove) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(.red)
                    .padding(6)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .padding(4)
        }
        .overlay(alignment: .topLeading) {
            HStack(spacing: 3) {
                Circle().fill(.red).frame(width: 4, height: 4)
                Text("LIVE")
                    .font(.system(size: 7, weight: .heavy))
                    .foregroundStyle(.red)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(.red.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .padding(6)
        }
    }
}
