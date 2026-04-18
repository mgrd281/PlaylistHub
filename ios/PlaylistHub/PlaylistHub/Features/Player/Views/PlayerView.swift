import SwiftUI
import AVKit

struct PlayerView: View {
    let item: PlaylistItem
    let channelList: [PlaylistItem]?
    let onNavigate: (PlaylistItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: PlayerViewModel

    init(item: PlaylistItem, channelList: [PlaylistItem]?, onNavigate: @escaping (PlaylistItem) -> Void) {
        self.item = item
        self.channelList = channelList
        self.onNavigate = onNavigate
        _viewModel = StateObject(wrappedValue: PlayerViewModel(item: item, channelList: channelList))
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Header
                    playerHeader
                        .padding(.top, geo.safeAreaInsets.top > 0 ? 0 : 8)

                    // Video
                    ZStack {
                        VideoPlayerRepresentable(player: viewModel.player)
                            .ignoresSafeArea(edges: .horizontal)

                        // Loading
                        if viewModel.isBuffering {
                            ProgressView()
                                .scaleEffect(1.5)
                                .tint(.white)
                        }

                        // Error
                        if let error = viewModel.error {
                            VStack(spacing: 12) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.title)
                                    .foregroundStyle(.red)
                                Text(error)
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.8))
                                    .multilineTextAlignment(.center)
                                Button("Retry") {
                                    viewModel.retry()
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(.red)
                            }
                            .padding()
                        }
                    }
                    .aspectRatio(16/9, contentMode: .fit)
                    .background(.black)
                    .clipShape(RoundedRectangle(cornerRadius: 0))

                    // Controls below video
                    playerControls

                    // Channel navigation strip
                    if let channelList, channelList.count > 1 {
                        relatedChannelsStrip(channelList: channelList)
                    }

                    // Series episodes
                    if item.contentType == .series {
                        seriesEpisodesList
                    }

                    Spacer(minLength: 0)
                }
            }
        }
        .statusBarHidden(false)
        .preferredColorScheme(.dark)
        .onAppear { viewModel.play() }
        .onDisappear { viewModel.stop() }
    }

    // MARK: - Header

    private var playerHeader: some View {
        HStack(spacing: 12) {
            // Close
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 32, height: 32)
                    .background(.white.opacity(0.1))
                    .clipShape(Circle())
            }

            // Logo + info
            if let logoURL = item.resolvedLogoURL {
                AsyncImage(url: logoURL) { phase in
                    if case .success(let image) = phase {
                        image.resizable().aspectRatio(contentMode: .fit)
                    } else {
                        Image(systemName: "tv.fill")
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 30, height: 30)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(viewModel.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let group = item.groupTitle {
                        Text(group)
                            .lineLimit(1)
                    }
                    if let pos = viewModel.positionText {
                        Text("•")
                        Text(pos)
                            .monospacedDigit()
                    }
                }
                .font(.caption)
                .foregroundStyle(.white.opacity(0.4))
            }

            Spacer()

            if item.isLive {
                HStack(spacing: 4) {
                    Circle()
                        .fill(.red)
                        .frame(width: 6, height: 6)
                    Text("LIVE")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(.red)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.red.opacity(0.15))
                .clipShape(Capsule())
            }

            // Channel nav
            if viewModel.hasNavigation {
                HStack(spacing: 2) {
                    Button {
                        if let prev = viewModel.prevChannel {
                            onNavigate(prev)
                        }
                    } label: {
                        Image(systemName: "backward.fill")
                            .font(.caption)
                            .foregroundStyle(viewModel.prevChannel != nil ? .white : .white.opacity(0.2))
                            .frame(width: 32, height: 32)
                    }
                    .disabled(viewModel.prevChannel == nil)

                    Button {
                        if let next = viewModel.nextChannel {
                            onNavigate(next)
                        }
                    } label: {
                        Image(systemName: "forward.fill")
                            .font(.caption)
                            .foregroundStyle(viewModel.nextChannel != nil ? .white : .white.opacity(0.2))
                            .frame(width: 32, height: 32)
                    }
                    .disabled(viewModel.nextChannel == nil)
                }
                .background(.white.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    // MARK: - Controls

    private var playerControls: some View {
        VStack(spacing: 8) {
            // Progress bar (VOD only)
            if !item.isLive, viewModel.duration > 0 {
                VStack(spacing: 4) {
                    Slider(
                        value: Binding(
                            get: { viewModel.currentTime },
                            set: { viewModel.seek(to: $0) }
                        ),
                        in: 0...max(viewModel.duration, 1)
                    )
                    .tint(.red)

                    HStack {
                        Text(viewModel.currentTimeFormatted)
                            .monospacedDigit()
                        Spacer()
                        Text(viewModel.durationFormatted)
                            .monospacedDigit()
                    }
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.4))
                }
            }

            // Buttons row
            HStack(spacing: 24) {
                if !item.isLive {
                    Button { viewModel.seekRelative(-10) } label: {
                        Image(systemName: "gobackward.10")
                            .font(.title3)
                    }
                }

                Button { viewModel.togglePlayPause() } label: {
                    Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title)
                }

                if !item.isLive {
                    Button { viewModel.seekRelative(10) } label: {
                        Image(systemName: "goforward.10")
                            .font(.title3)
                    }
                }

                Spacer()

                // PiP
                Button { viewModel.togglePiP() } label: {
                    Image(systemName: "pip.enter")
                        .font(.body)
                }
            }
            .foregroundStyle(.white)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
    }

    // MARK: - Related Channels

    private func relatedChannelsStrip(channelList: [PlaylistItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SAME GROUP")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.3))
                .tracking(1)
                .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(channelList.filter { $0.id != item.id && $0.groupTitle == item.groupTitle }.prefix(20)) { ch in
                        Button {
                            onNavigate(ch)
                        } label: {
                            HStack(spacing: 8) {
                                if let logoURL = ch.resolvedLogoURL {
                                    AsyncImage(url: logoURL) { phase in
                                        if case .success(let image) = phase {
                                            image.resizable().aspectRatio(contentMode: .fit)
                                        } else {
                                            Image(systemName: "tv.fill").foregroundStyle(.secondary)
                                        }
                                    }
                                    .frame(width: 24, height: 24)
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                                } else {
                                    Image(systemName: "tv.fill")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .frame(width: 24, height: 24)
                                }
                                Text(ch.name)
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.7))
                                    .lineLimit(1)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(.white.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Series Episodes

    private var seriesEpisodesList: some View {
        Group {
            if viewModel.isLoadingEpisodes {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding()
            } else if let episodes = viewModel.seriesEpisodes {
                VStack(alignment: .leading, spacing: 8) {
                    // Season picker
                    if episodes.seasons.count > 1 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(episodes.seasons, id: \.season) { season in
                                    Button {
                                        viewModel.selectedSeason = season.season
                                    } label: {
                                        Text("S\(season.season)")
                                            .font(.caption.weight(.semibold))
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 6)
                                            .background(viewModel.selectedSeason == season.season ? .red : .white.opacity(0.08))
                                            .foregroundStyle(viewModel.selectedSeason == season.season ? .white : .white.opacity(0.6))
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }

                    // Episodes
                    let currentEpisodes = episodes.seasons.first { $0.season == viewModel.selectedSeason }?.episodes ?? []
                    ScrollView {
                        LazyVStack(spacing: 4) {
                            ForEach(currentEpisodes) { ep in
                                Button {
                                    viewModel.playEpisode(ep)
                                } label: {
                                    HStack {
                                        Text("E\(ep.episode)")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(.secondary)
                                            .frame(width: 30)
                                        Text(ep.title)
                                            .font(.subheadline)
                                            .foregroundStyle(.white)
                                            .lineLimit(1)
                                        Spacer()
                                        if viewModel.activeEpisodeId == ep.id {
                                            Image(systemName: "speaker.wave.2.fill")
                                                .font(.caption)
                                                .foregroundStyle(.red)
                                        }
                                    }
                                    .padding(.horizontal)
                                    .padding(.vertical, 10)
                                    .background(viewModel.activeEpisodeId == ep.id ? .red.opacity(0.1) : .clear)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - AVPlayer SwiftUI wrapper

struct VideoPlayerRepresentable: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let vc = AVPlayerViewController()
        vc.player = player
        vc.showsPlaybackControls = false
        vc.allowsPictureInPicturePlayback = true
        vc.videoGravity = .resizeAspect
        return vc
    }

    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {
        vc.player = player
    }
}

// MARK: - ViewModel

@MainActor
final class PlayerViewModel: ObservableObject {
    let item: PlaylistItem
    let channelList: [PlaylistItem]?

    @Published var isPlaying = false
    @Published var isBuffering = true
    @Published var error: String?
    @Published var currentTime: Double = 0
    @Published var duration: Double = 0
    @Published var displayName: String
    @Published var seriesEpisodes: SeriesEpisodesResponse?
    @Published var isLoadingEpisodes = false
    @Published var selectedSeason = 1
    @Published var activeEpisodeId: String?

    let player = AVPlayer()
    private var timeObserver: Any?

    // Navigation
    private let currentIndex: Int
    var prevChannel: PlaylistItem? {
        guard currentIndex > 0 else { return nil }
        return channelList?[currentIndex - 1]
    }
    var nextChannel: PlaylistItem? {
        guard let list = channelList, currentIndex >= 0, currentIndex < list.count - 1 else { return nil }
        return list[currentIndex + 1]
    }
    var hasNavigation: Bool {
        channelList != nil && (channelList?.count ?? 0) > 1 && currentIndex >= 0
    }
    var positionText: String? {
        guard hasNavigation else { return nil }
        return "\(currentIndex + 1)/\(channelList!.count)"
    }

    var currentTimeFormatted: String { Self.formatTime(currentTime) }
    var durationFormatted: String { Self.formatTime(duration) }

    init(item: PlaylistItem, channelList: [PlaylistItem]?) {
        self.item = item
        self.channelList = channelList
        self.displayName = item.name
        self.currentIndex = channelList?.firstIndex(where: { $0.id == item.id }) ?? -1
    }

    func play() {
        let url = item.proxiedStreamURL
        let playerItem = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: playerItem)
        player.play()
        isPlaying = true

        // Observe time
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            Task { @MainActor in
                self.currentTime = time.seconds
                if let dur = self.player.currentItem?.duration.seconds, dur.isFinite {
                    self.duration = dur
                }
                self.isBuffering = self.player.timeControlStatus == .waitingToPlayAtSpecifiedRate
                self.isPlaying = self.player.timeControlStatus == .playing
            }
        }

        // Load series episodes if needed
        if item.contentType == .series {
            loadEpisodes()
        }
    }

    func stop() {
        player.pause()
        if let obs = timeObserver {
            player.removeTimeObserver(obs)
        }
    }

    func togglePlayPause() {
        if isPlaying {
            player.pause()
        } else {
            player.play()
        }
        isPlaying = !isPlaying
    }

    func seek(to time: Double) {
        player.seek(to: CMTime(seconds: time, preferredTimescale: 600))
    }

    func seekRelative(_ delta: Double) {
        let target = max(0, min(duration, currentTime + delta))
        seek(to: target)
    }

    func togglePiP() {
        // PiP is handled by AVPlayerViewController automatically
    }

    func retry() {
        error = nil
        isBuffering = true
        play()
    }

    func playEpisode(_ episode: EpisodeData) {
        let url = AppConfig.streamProxyURL(for: episode.streamUrl)
        let playerItem = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: playerItem)
        player.play()
        isPlaying = true
        activeEpisodeId = episode.id
        displayName = episode.title
    }

    private func loadEpisodes() {
        isLoadingEpisodes = true
        Task {
            do {
                let episodes = try await DataService.shared.fetchSeriesEpisodes(streamUrl: item.streamUrl)
                self.seriesEpisodes = episodes
                if let first = episodes.seasons.first {
                    self.selectedSeason = first.season
                }
            } catch {}
            isLoadingEpisodes = false
        }
    }

    static func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let h = Int(seconds) / 3600
        let m = (Int(seconds) % 3600) / 60
        let s = Int(seconds) % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }
}

#Preview {
    PlayerView(
        item: PlaylistItem(
            id: UUID(), playlistId: UUID(), name: "Test Channel",
            streamUrl: "https://example.com/live/test/test/123.m3u8",
            groupTitle: "News", contentType: .channel, createdAt: .now
        ),
        channelList: nil,
        onNavigate: { _ in }
    )
}
