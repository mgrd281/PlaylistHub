import SwiftUI

struct SplashView: View {
    // Staggered animation states
    @State private var logoScale: CGFloat = 0.5
    @State private var logoOpacity: Double = 0
    @State private var logoGlow: Double = 0
    @State private var nameOffset: CGFloat = 18
    @State private var nameOpacity: Double = 0
    @State private var taglineOpacity: Double = 0
    @State private var creditOpacity: Double = 0

    var body: some View {
        ZStack {
            // Deep black with subtle radial accent
            Color.black.ignoresSafeArea()

            // Subtle radial glow behind logo
            RadialGradient(
                colors: [Color.red.opacity(0.08 * logoGlow), .clear],
                center: .center,
                startRadius: 20,
                endRadius: 200
            )
            .ignoresSafeArea()
            .offset(y: -40)

            VStack(spacing: 0) {
                Spacer()

                // ── Logo Icon ──
                Image(systemName: "play.rectangle.fill")
                    .font(.system(size: 52, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(red: 0.95, green: 0.2, blue: 0.2), Color(red: 0.85, green: 0.15, blue: 0.15)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .scaleEffect(logoScale)
                    .opacity(logoOpacity)
                    .shadow(color: .red.opacity(0.3 * logoGlow), radius: 20, y: 4)

                // ── App Name ──
                Text("PlaylistHub")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .opacity(nameOpacity)
                    .offset(y: nameOffset)
                    .padding(.top, 18)

                // ── Tagline ──
                Text("Your playlists, everywhere")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.4))
                    .opacity(taglineOpacity)
                    .padding(.top, 8)

                Spacer()

                // ── Karinex Attribution ──
                Text("Ein Unternehmen der karinex.de")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.2))
                    .tracking(0.8)
                    .opacity(creditOpacity)
                    .padding(.bottom, 48)
            }
        }
        .onAppear {
            // Phase 1: Logo — scale + fade (0s)
            withAnimation(.easeOut(duration: 0.5)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }

            // Phase 1b: Logo glow pulse
            withAnimation(.easeInOut(duration: 0.8).delay(0.2)) {
                logoGlow = 1.0
            }

            // Phase 2: App name — slide up + fade (0.2s delay)
            withAnimation(.easeOut(duration: 0.5).delay(0.2)) {
                nameOffset = 0
                nameOpacity = 1.0
            }

            // Phase 3: Tagline — soft fade (0.4s delay)
            withAnimation(.easeOut(duration: 0.4).delay(0.45)) {
                taglineOpacity = 1.0
            }

            // Phase 4: Credit — subtle fade (0.5s delay)
            withAnimation(.easeOut(duration: 0.5).delay(0.55)) {
                creditOpacity = 1.0
            }
        }
    }
}

#Preview {
    SplashView()
}
