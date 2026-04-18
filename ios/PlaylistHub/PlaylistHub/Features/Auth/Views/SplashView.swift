import SwiftUI

struct SplashView: View {
    @State private var logoScale: CGFloat = 0.6
    @State private var logoOpacity: Double = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "play.rectangle.fill")
                    .font(.system(size: 56, weight: .medium))
                    .foregroundStyle(.red)
                    .scaleEffect(logoScale)
                    .opacity(logoOpacity)

                Text("PlaylistHub")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .opacity(logoOpacity)

                Text("Your playlists, everywhere")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.5))
                    .opacity(logoOpacity)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.8)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }
        }
    }
}

#Preview {
    SplashView()
}
