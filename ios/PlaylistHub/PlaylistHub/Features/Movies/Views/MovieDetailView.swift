import SwiftUI

// MARK: - Movie Detail View (cinematic full-screen)

struct MovieDetailView: View {
    let item: PlaylistItem
    /// Optional channel list context for live TV scrubbing
    var channelList: [PlaylistItem]?
    @Environment(\.dismiss) private var dismiss
    @State private var appeared = false
    @State private var showPlayer = false

    // Extract genre from groupTitle (e.g. "EN | Action" → "Action")
    private var genre: String? {
        guard let group = item.groupTitle else { return nil }
        let cleaned = group
            .components(separatedBy: "|").last?
            .trimmingCharacters(in: .whitespaces)
        return cleaned?.isEmpty == true ? nil : cleaned
    }

    private var typeLabel: String {
        switch item.contentType {
        case .movie: return "MOVIE"
        case .series: return "SERIES"
        case .channel: return "LIVE"
        case .uncategorized: return "VIDEO"
        }
    }

    var body: some View {
        ZStack {
            // Layer 0: Solid black base
            Color.black.ignoresSafeArea()

            // Layer 1: Full-bleed poster backdrop
            backdrop

            // Layer 2: Gradient overlays for readability
            gradientOverlays

            // Layer 3: Content
            VStack(spacing: 0) {
                // Top bar
                topBar
                    .padding(.top, 8)

                Spacer()

                // Bottom content area
                bottomContent
                    .padding(.bottom, 40)
            }
            .padding(.horizontal, 24)
        }
        .statusBarHidden()
        .fullScreenCover(isPresented: $showPlayer) {
            PlayerView(item: item, channelList: channelList)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.8)) {
                appeared = true
            }
        }
    }

    // MARK: - Backdrop

    private var backdrop: some View {
        GeometryReader { geo in
            if let url = item.resolvedLogoURL {
                CachedAsyncImage(url: url) {
                    backdropFallback
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: geo.size.width, height: geo.size.height)
                .clipped()
                .scaleEffect(appeared ? 1.03 : 1.08)
                .animation(.easeOut(duration: 1.2), value: appeared)
            } else {
                backdropFallback
            }
        }
        .ignoresSafeArea()
    }

    private var backdropFallback: some View {
        ZStack {
            LinearGradient(
                colors: PosterCard.gradientColors(for: item.name) + [.black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: item.contentType == .movie ? "film.fill" : "rectangle.stack.fill")
                .font(.system(size: 60, weight: .ultraLight))
                .foregroundStyle(.white.opacity(0.08))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Gradient Overlays

    private var gradientOverlays: some View {
        ZStack {
            // Top fade for navigation bar area
            VStack {
                LinearGradient(
                    colors: [.black.opacity(0.7), .black.opacity(0.3), .clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 160)
                Spacer()
            }

            // Bottom fade for title & buttons
            VStack {
                Spacer()
                LinearGradient(
                    colors: [.clear, .black.opacity(0.5), .black.opacity(0.85), .black.opacity(0.95)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 380)
            }

            // Subtle vignette edges
            LinearGradient(
                colors: [.black.opacity(0.3), .clear, .clear, .black.opacity(0.3)],
                startPoint: .leading,
                endPoint: .trailing
            )
        }
        .ignoresSafeArea()
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial.opacity(0.5), in: Circle())
            }

            Spacer()

            // Content type badge
            Text(typeLabel)
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.5)
                .foregroundStyle(.white.opacity(0.7))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.ultraThinMaterial.opacity(0.4), in: Capsule())
        }
    }

    // MARK: - Bottom Content

    private var bottomContent: some View {
        VStack(spacing: 0) {
            // Genre / Category pill
            if let genre {
                Text(genre.uppercased())
                    .font(.system(size: 10, weight: .bold))
                    .tracking(2)
                    .foregroundStyle(.white.opacity(0.5))
                    .padding(.bottom, 12)
            }

            // Title
            Text(item.name)
                .font(.system(size: 32, weight: .black, design: .default))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.6)
                .shadow(color: .black.opacity(0.5), radius: 8, y: 4)
                .padding(.bottom, 8)

            // Tagline / group info
            if let group = item.groupTitle, !group.isEmpty {
                Text(group)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.45))
                    .lineLimit(1)
                    .padding(.bottom, 24)
            } else {
                Spacer().frame(height: 24)
            }

            // Play button
            Button { showPlayer = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 16))
                    Text("Play")
                        .font(.system(size: 16, weight: .bold))
                }
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(.white, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 12)

            // Secondary actions row
            HStack(spacing: 32) {
                secondaryButton(icon: "plus", label: "My List")
                secondaryButton(icon: "hand.thumbsup", label: "Rate")
                secondaryButton(icon: "square.and.arrow.up", label: "Share")
            }
            .padding(.top, 4)
        }
    }

    private func secondaryButton(icon: String, label: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .light))
                .foregroundStyle(.white.opacity(0.7))
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(0.45))
        }
    }
}
