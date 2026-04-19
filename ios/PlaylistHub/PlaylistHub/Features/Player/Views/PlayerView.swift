import SwiftUI
import AVKit
import Combine

// MARK: - PlayerView — Instant playback, seamless channel switching

struct PlayerView: View {
    @StateObject var vm: PlayerViewModel
    @Environment(\.dismiss) private var dismiss

    /// Secondary UI appears after playback starts
    @State private var showSecondaryUI = false
    /// Controls overlay visibility (auto-hide)
    @State private var showControls = true
    @State private var controlsTimer: Timer?

    init(item: PlaylistItem, channelList: [PlaylistItem]?) {
        _vm = StateObject(wrappedValue: PlayerViewModel(item: item, channelList: channelList))
    }

    var body: some View {
        ZStack {
            // 1) Black canvas — renders immediately
            Color.black.ignoresSafeArea()

            // 2) Video layer — full screen behind everything
            VideoSurface(player: vm.player)
                .ignoresSafeArea()
                .onTapGesture { toggleControlsVisibility() }
                .gesture(
                    DragGesture(minimumDistance: 50)
                        .onEnded { value in
                            let horizontal = value.translation.width
                            if abs(horizontal) > abs(value.translation.height) {
                                if horizontal < -50 { vm.goNext() }
                                else if horizontal > 50 { vm.goPrev() }
                            }
                        }
                )

            // 3) Buffering spinner — centered, minimal
            if vm.isBuffering && vm.error == nil {
                ProgressView()
                    .scaleEffect(1.3)
                    .tint(.white)
                    .transition(.opacity)
            }

            // 4) Error overlay
            if let error = vm.error {
                VStack(spacing: 14) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(.white.opacity(0.5))
                    Text(error)
                        .font(.callout)
                        .foregroundStyle(.white.opacity(0.7))
                        .multilineTextAlignment(.center)
                    Button { vm.retry() } label: {
                        Text("Retry")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 24)
                            .padding(.vertical, 10)
                            .background(.red)
                            .foregroundStyle(.white)
                            .clipShape(Capsule())
                    }
                }
                .padding(32)
            }

            // 5) Controls overlay — fades in/out
            if showControls {
                VStack(spacing: 0) {
                    headerBar
                    Spacer()
                    if !vm.currentItem.isLive && vm.duration > 0 {
                        progressBar
                    }
                    controlsBar
                }
                .transition(.opacity)
            }

            // 6) Channel name flash on switch
            if vm.showChannelFlash {
                channelFlashOverlay
                    .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }
        }
        .animation(.easeOut(duration: 0.2), value: showControls)
        .animation(.easeOut(duration: 0.2), value: vm.isBuffering)
        .animation(.easeOut(duration: 0.25), value: vm.showChannelFlash)
        .statusBarHidden(showControls ? false : true)
        .preferredColorScheme(.dark)
        .onAppear {
            vm.startPlayback()
            scheduleControlsHide()
        }
        .onDisappear {
            vm.saveWatchProgress()
            vm.teardown()
        }
        .onChange(of: vm.hasFirstFrame) { _, ready in
            if ready {
                withAnimation(.easeIn(duration: 0.3)) { showSecondaryUI = true }
            }
        }
        // Secondary panel slides up after playback starts
        .safeAreaInset(edge: .bottom) {
            if showSecondaryUI {
                secondaryPanel
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack(spacing: 10) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial, in: Circle())
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(vm.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let group = vm.currentItem.groupTitle {
                    Text(group)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.45))
                        .lineLimit(1)
                }
            }

            Spacer()

            if vm.currentItem.isLive {
                liveBadge
            }

            if vm.hasNavigation {
                channelNavButtons
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(
            LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top)
        )
    }

    private var liveBadge: some View {
        HStack(spacing: 4) {
            Circle().fill(.red).frame(width: 5, height: 5)
            Text("LIVE")
                .font(.system(size: 9, weight: .heavy))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.red.opacity(0.85), in: Capsule())
    }

    private var channelNavButtons: some View {
        HStack(spacing: 0) {
            Button { vm.goPrev() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .bold))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(vm.prevChannel != nil ? .white : .white.opacity(0.2))
            }
            .disabled(vm.prevChannel == nil)

            if let pos = vm.positionText {
                Text(pos)
                    .font(.system(size: 10, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.5))
            }

            Button { vm.goNext() } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(vm.nextChannel != nil ? .white : .white.opacity(0.2))
            }
            .disabled(vm.nextChannel == nil)
        }
        .background(.ultraThinMaterial, in: Capsule())
    }

    // MARK: - Progress (VOD)

    private var progressBar: some View {
        VStack(spacing: 4) {
            Slider(
                value: Binding(get: { vm.currentTime }, set: { vm.seek(to: $0) }),
                in: 0...max(vm.duration, 1)
            )
            .tint(.red)

            HStack {
                Text(vm.currentTimeFormatted).monospacedDigit()
                Spacer()
                Text(vm.durationFormatted).monospacedDigit()
            }
            .font(.system(size: 10))
            .foregroundStyle(.white.opacity(0.4))
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Controls

    private var controlsBar: some View {
        HStack(spacing: 0) {
            if !vm.currentItem.isLive {
                Button { vm.seekRelative(-10) } label: {
                    Image(systemName: "gobackward.10")
                        .font(.title3)
                        .frame(width: 48, height: 48)
                }
            }

            Spacer()

            Button { vm.togglePlayPause() } label: {
                Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 32))
                    .frame(width: 64, height: 64)
            }

            Spacer()

            if !vm.currentItem.isLive {
                Button { vm.seekRelative(10) } label: {
                    Image(systemName: "goforward.10")
                        .font(.title3)
                        .frame(width: 48, height: 48)
                }
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
        .background(
            LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    // MARK: - Channel Flash

    private var channelFlashOverlay: some View {
        VStack(spacing: 6) {
            Text(vm.displayName)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
            if let group = vm.currentItem.groupTitle {
                Text(group)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    // MARK: - Secondary Panel (after playback)

    @ViewBuilder
    private var secondaryPanel: some View {
        if vm.relatedChannels.count > 0 {
            channelStrip(vm.relatedChannels)
        } else if vm.currentItem.contentType == .series {
            seriesPanel
        }
    }

    private func channelStrip(_ list: [PlaylistItem]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(vm.currentItem.groupTitle?.uppercased() ?? "CHANNELS")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white.opacity(0.3))
                    .tracking(1.2)
                Text("\(list.count)")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.white.opacity(0.2))
            }
            .padding(.horizontal, 16)

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 6) {
                        ForEach(list) { ch in
                            let isActive = ch.id == vm.currentItem.id
                            Button {
                                vm.switchTo(ch)
                                scheduleControlsHide()
                            } label: {
                                HStack(spacing: 5) {
                                    if isActive {
                                        Circle()
                                            .fill(.red)
                                            .frame(width: 5, height: 5)
                                    }
                                    if let logo = ch.resolvedLogoURL {
                                        AsyncImage(url: logo) { phase in
                                            switch phase {
                                            case .success(let image):
                                                image.resizable().aspectRatio(contentMode: .fit)
                                                    .frame(width: 14, height: 14)
                                                    .clipShape(RoundedRectangle(cornerRadius: 3))
                                            default:
                                                EmptyView()
                                            }
                                        }
                                    }
                                    Text(ch.name)
                                        .font(.system(size: 12, weight: isActive ? .bold : .regular))
                                        .lineLimit(1)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(isActive ? .red : .white.opacity(0.08))
                                .foregroundStyle(isActive ? .white : .white.opacity(0.7))
                                .clipShape(Capsule())
                            }
                            .id(ch.id)
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .onAppear {
                    proxy.scrollTo(vm.currentItem.id, anchor: .center)
                }
                .onChange(of: vm.currentItem.id) { _, newId in
                    withAnimation { proxy.scrollTo(newId, anchor: .center) }
                }
            }
        }
        .padding(.vertical, 10)
        .background(.black.opacity(0.85))
    }

    @ViewBuilder
    private var seriesPanel: some View {
        if vm.isLoadingEpisodes {
            ProgressView().tint(.white).padding()
        } else if let eps = vm.seriesEpisodes {
            VStack(alignment: .leading, spacing: 6) {
                if eps.seasons.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(eps.seasons, id: \.season) { s in
                                Button {
                                    vm.selectedSeason = s.season
                                } label: {
                                    Text("S\(s.season)")
                                        .font(.caption2.weight(.semibold))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 5)
                                        .background(vm.selectedSeason == s.season ? .red : .white.opacity(0.08))
                                        .foregroundStyle(.white)
                                        .clipShape(Capsule())
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }

                let episodes = eps.seasons.first { $0.season == vm.selectedSeason }?.episodes ?? []
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 6) {
                        ForEach(episodes) { ep in
                            Button { vm.playEpisode(ep) } label: {
                                VStack(spacing: 2) {
                                    Text("E\(ep.episode)")
                                        .font(.caption2.weight(.bold))
                                    Text(ep.title)
                                        .font(.system(size: 9))
                                        .lineLimit(1)
                                }
                                .frame(width: 60)
                                .padding(.vertical, 8)
                                .background(vm.activeEpisodeId == ep.id ? .red.opacity(0.2) : .white.opacity(0.06))
                                .foregroundStyle(vm.activeEpisodeId == ep.id ? .red : .white.opacity(0.7))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.vertical, 10)
            .background(.black.opacity(0.85))
        }
    }

    // MARK: - Helpers

    private func toggleControlsVisibility() {
        showControls.toggle()
        if showControls { scheduleControlsHide() }
    }

    private func scheduleControlsHide() {
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: 4, repeats: false) { _ in
            Task { @MainActor in
                withAnimation { showControls = false }
            }
        }
    }
}

// MARK: - Lightweight AVPlayer UIView (not UIViewController — faster)

struct VideoSurface: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerUIView {
        let view = PlayerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ uiView: PlayerUIView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
    }
}

final class PlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

// MARK: - ViewModel — Persistent player, instant switching

@MainActor
final class PlayerViewModel: ObservableObject {
    // Current item (mutates on channel switch — no view rebuild)
    @Published var currentItem: PlaylistItem
    let channelList: [PlaylistItem]?

    @Published var isPlaying = false
    @Published var isBuffering = true
    @Published var error: String?
    @Published var currentTime: Double = 0
    @Published var duration: Double = 0
    @Published var displayName: String
    @Published var hasFirstFrame = false
    @Published var showChannelFlash = false

    // Series
    @Published var seriesEpisodes: SeriesEpisodesResponse?
    @Published var isLoadingEpisodes = false
    @Published var selectedSeason = 1
    @Published var activeEpisodeId: String?

    /// Single persistent AVPlayer — reused across channel switches
    let player: AVPlayer = {
        let p = AVPlayer()
        p.automaticallyWaitsToMinimizeStalling = false
        return p
    }()

    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var currentIndex: Int
    private var lastHistorySave: CFAbsoluteTime = 0

    /// Cascade fallback state
    private var fallbackURLs: [URL] = []
    private var fallbackTimer: DispatchWorkItem?
    private var loadStartTime: CFAbsoluteTime = 0

    /// Timeout per source in cascade (seconds)
    private static let sourceTimeout: TimeInterval = 6

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

    /// Related channels: same group first, then nearby from full list
    var relatedChannels: [PlaylistItem] {
        guard let list = channelList, list.count > 1 else { return [] }
        let maxCount = 40

        // Same group_title first (excluding current)
        let sameGroup = list.filter {
            $0.id != currentItem.id && $0.groupTitle == currentItem.groupTitle
        }

        if sameGroup.count >= maxCount { return Array(sameGroup.prefix(maxCount)) }

        // Fill with nearby channels from different groups
        var usedIds = Set(sameGroup.map { $0.id })
        usedIds.insert(currentItem.id)
        let remaining = maxCount - sameGroup.count
        let idx = currentIndex >= 0 ? currentIndex : 0

        var nearby: [PlaylistItem] = []
        var lo = idx - 1
        var hi = idx + 1
        while nearby.count < remaining && (lo >= 0 || hi < list.count) {
            if hi < list.count && !usedIds.contains(list[hi].id) {
                nearby.append(list[hi])
            }
            if lo >= 0 && !usedIds.contains(list[lo].id) {
                nearby.append(list[lo])
            }
            hi += 1
            lo -= 1
        }

        // Current item at front for highlight, then same-group, then nearby
        return [currentItem] + sameGroup + nearby
    }

    var currentTimeFormatted: String { Self.formatTime(currentTime) }
    var durationFormatted: String { Self.formatTime(duration) }

    init(item: PlaylistItem, channelList: [PlaylistItem]?) {
        self.currentItem = item
        self.channelList = channelList
        self.displayName = item.name
        self.currentIndex = channelList?.firstIndex(where: { $0.id == item.id }) ?? -1
    }

    // MARK: - Playback

    func startPlayback() {
        loadStream(for: currentItem)
        setupTimeObserver()
        if currentItem.contentType == .series { loadEpisodes() }
    }

    /// Hot-swap channel — no view dismiss, no animation delay
    func switchTo(_ item: PlaylistItem) {
        guard item.id != currentItem.id else { return }
        currentItem = item
        displayName = item.name
        currentIndex = channelList?.firstIndex(where: { $0.id == item.id }) ?? currentIndex
        isBuffering = true
        error = nil
        hasFirstFrame = false
        fallbackTimer?.cancel()
        fallbackURLs = []

        // Flash channel name
        showChannelFlash = true
        Task {
            try? await Task.sleep(for: .seconds(1.2))
            showChannelFlash = false
        }

        loadStream(for: item)
    }

    func goNext() {
        guard let next = nextChannel else { return }
        switchTo(next)
    }

    func goPrev() {
        guard let prev = prevChannel else { return }
        switchTo(prev)
    }

    /// Build URL cascade and start with the fastest source (direct → CF → Vercel)
    private func loadStream(for item: PlaylistItem) {
        let cascade = AppConfig.streamCascade(for: item.resolvedStreamURL)
        guard let first = cascade.first else {
            error = "Invalid stream URL"
            isBuffering = false
            return
        }
        fallbackURLs = Array(cascade.dropFirst())
        loadStartTime = CFAbsoluteTimeGetCurrent()
        playURL(first)
    }

    /// Attempt playback from a single URL. On failure/timeout, cascade to next.
    private func playURL(_ url: URL) {
        let attemptStart = CFAbsoluteTimeGetCurrent()
        let host = url.host ?? url.absoluteString.prefix(60).description
        print("[Player] ▶ Trying: \(host)")

        let asset = AVURLAsset(url: url, options: [
            "AVURLAssetHTTPHeaderFieldsKey": [
                "User-Agent": "VLC/3.0.21 LibVLC/3.0.21"
            ],
            AVURLAssetPreferPreciseDurationAndTimingKey: false
        ])
        let playerItem = AVPlayerItem(asset: asset)
        playerItem.preferredForwardBufferDuration = 2

        // Cancel previous observers
        statusObserver?.invalidate()
        fallbackTimer?.cancel()

        statusObserver = playerItem.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let elapsed = CFAbsoluteTimeGetCurrent() - attemptStart
                let total = CFAbsoluteTimeGetCurrent() - self.loadStartTime
                switch item.status {
                case .readyToPlay:
                    print("[Player] ✓ Ready in \(String(format: "%.1f", elapsed))s (total \(String(format: "%.1f", total))s) via \(host)")
                    self.hasFirstFrame = true
                    self.fallbackURLs = []
                    self.fallbackTimer?.cancel()
                    self.resumeIfNeeded()
                case .failed:
                    let reason = item.error?.localizedDescription ?? "unknown"
                    print("[Player] ✗ Failed in \(String(format: "%.1f", elapsed))s: \(reason)")
                    self.advanceToNextSource(lastError: reason)
                default: break
                }
            }
        }

        // Timeout: if this source doesn't resolve within limit, try next
        let timeout = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                guard let self, !self.hasFirstFrame else { return }
                print("[Player] ⏱ Timeout (\(Self.sourceTimeout)s) for \(host)")
                self.advanceToNextSource(lastError: "Timeout — source too slow")
            }
        }
        fallbackTimer = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.sourceTimeout, execute: timeout)

        player.replaceCurrentItem(with: playerItem)
        player.play()
        isPlaying = true
    }

    /// Move to next URL in the cascade, or show error if none left
    private func advanceToNextSource(lastError: String?) {
        fallbackTimer?.cancel()
        statusObserver?.invalidate()

        if let next = fallbackURLs.first {
            fallbackURLs.removeFirst()
            playURL(next)
        } else {
            let total = CFAbsoluteTimeGetCurrent() - loadStartTime
            print("[Player] ✗ All sources exhausted after \(String(format: "%.1f", total))s")
            error = lastError ?? "Playback failed"
            isBuffering = false
        }
    }

    private func setupTimeObserver() {
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
                let status = self.player.timeControlStatus
                self.isBuffering = status == .waitingToPlayAtSpecifiedRate
                self.isPlaying = status == .playing

                // Save watch progress every ~5 seconds
                let now = CFAbsoluteTimeGetCurrent()
                if now - self.lastHistorySave > 5 {
                    self.lastHistorySave = now
                    self.saveWatchProgress()
                }
            }
        }
    }

    func teardown() {
        fallbackTimer?.cancel()
        player.pause()
        player.replaceCurrentItem(with: nil)
        if let obs = timeObserver { player.removeTimeObserver(obs) }
        statusObserver?.invalidate()
    }

    /// Save current playback position to watch history
    func saveWatchProgress() {
        WatchHistoryManager.shared.record(
            itemId: currentItem.id,
            playlistId: currentItem.playlistId,
            name: displayName,
            streamUrl: currentItem.streamUrl,
            logoUrl: currentItem.logoUrl ?? currentItem.tvgLogo,
            groupTitle: currentItem.groupTitle,
            contentType: currentItem.contentType,
            position: currentTime,
            duration: duration
        )
    }

    /// Resume from saved position if available
    private func resumeIfNeeded() {
        if let saved = WatchHistoryManager.shared.savedPosition(for: currentItem.id) {
            seek(to: saved)
        }
    }

    func togglePlayPause() {
        if isPlaying { player.pause() } else { player.play() }
        isPlaying.toggle()
    }

    func seek(to time: Double) {
        player.seek(to: CMTime(seconds: time, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    }

    func seekRelative(_ delta: Double) {
        let target = max(0, min(duration, currentTime + delta))
        seek(to: target)
    }

    func retry() {
        error = nil
        isBuffering = true
        loadStream(for: currentItem)
    }

    func playEpisode(_ episode: EpisodeData) {
        // Episodes also use cascade for fastest start
        let cascade = AppConfig.streamCascade(for: episode.streamUrl)
        guard let first = cascade.first else { return }
        fallbackURLs = Array(cascade.dropFirst())
        loadStartTime = CFAbsoluteTimeGetCurrent()
        activeEpisodeId = episode.id
        displayName = episode.title
        playURL(first)
    }

    private func loadEpisodes() {
        isLoadingEpisodes = true
        Task {
            do {
                let episodes = try await DataService.shared.fetchSeriesEpisodes(streamUrl: currentItem.streamUrl)
                self.seriesEpisodes = episodes
                if let first = episodes.seasons.first { self.selectedSeason = first.season }
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
