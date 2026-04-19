import SwiftUI

struct MyListView: View {
    @StateObject private var myList = MyListManager.shared
    @EnvironmentObject private var themeManager: ThemeManager
    @State private var selectedItem: PlaylistItem?
    @State private var showClearConfirm = false

    private var accent: Color { themeManager.accentColor }
    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        Group {
            if myList.sortedItems.isEmpty {
                emptyState
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(myList.sortedItems, id: \.streamURL) { entry in
                            MyListCard(entry: entry, accent: accent) {
                                selectedItem = entry.toPlaylistItem()
                            } onRemove: {
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    myList.remove(streamURL: entry.streamURL)
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
        .navigationTitle("My List")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if myList.count > 0 {
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
        .alert("Clear My List?", isPresented: $showClearConfirm) {
            Button("Clear All", role: .destructive) {
                withAnimation { myList.removeAll() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will remove all \(myList.count) items from your list.")
        }
        .fullScreenCover(item: $selectedItem) { item in
            MovieDetailView(item: item)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "plus.rectangle.on.rectangle")
                .font(.system(size: 44, weight: .ultraLight))
                .foregroundStyle(.quaternary)
            VStack(spacing: 6) {
                Text("Your list is empty")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                Text("Add movies and series from their detail pages")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
            }
            Spacer()
        }
        .padding(.horizontal, 40)
    }
}

// MARK: - My List Card

private struct MyListCard: View {
    let entry: MyListManager.ListEntry
    let accent: Color
    let onTap: () -> Void
    let onRemove: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                if let urlStr = entry.logoURL, let url = URL(string: urlStr) {
                    CachedAsyncImage(url: url) {
                        cardFallback
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                } else {
                    cardFallback
                }
            }
            .frame(height: 165)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.name)
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(2)
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.6), radius: 2, y: 1)
                    if let group = entry.groupTitle {
                        Text(group)
                            .font(.system(size: 9))
                            .foregroundStyle(.white.opacity(0.6))
                            .lineLimit(1)
                    }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    LinearGradient(colors: [.black.opacity(0.75), .clear], startPoint: .bottom, endPoint: .top)
                )
                .clipShape(
                    UnevenRoundedRectangle(bottomLeadingRadius: 10, bottomTrailingRadius: 10)
                )
            }
            .overlay(alignment: .topTrailing) {
                // Remove button
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, .black.opacity(0.5))
                }
                .padding(6)
            }
            .overlay(alignment: .topLeading) {
                // Content type badge
                if entry.contentType == "series" {
                    Image(systemName: "rectangle.stack.fill")
                        .font(.system(size: 8))
                        .foregroundStyle(.white)
                        .padding(4)
                        .background(.black.opacity(0.5), in: Circle())
                        .padding(6)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var cardFallback: some View {
        ZStack {
            LinearGradient(
                colors: PosterCard.gradientColors(for: entry.name),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            VStack(spacing: 6) {
                Image(systemName: entry.contentType == "movie" ? "film.fill" : "rectangle.stack.fill")
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(.white.opacity(0.5))
                Text(entry.name)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .padding(.horizontal, 8)
            }
        }
    }
}

// MARK: - ListEntry → PlaylistItem conversion

extension MyListManager.ListEntry {
    func toPlaylistItem() -> PlaylistItem {
        PlaylistItem(
            id: UUID(),
            playlistId: UUID(),
            scanId: nil,
            categoryId: nil,
            name: name,
            streamUrl: streamURL,
            logoUrl: logoURL,
            groupTitle: groupTitle,
            contentType: ContentType(rawValue: contentType) ?? .movie,
            tvgId: nil,
            tvgName: nil,
            tvgLogo: logoURL,
            metadata: nil,
            createdAt: addedAt
        )
    }
}
