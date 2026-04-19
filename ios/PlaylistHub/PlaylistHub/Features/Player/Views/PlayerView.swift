import SwiftUI
import AVKit
import AVFoundation
import MediaPlayer
import Combine

// MARK: - PlayerView — Instant playback, seamless channel switching

struct PlayerView: View {
    @StateObject var vm: PlayerViewModel
    @Environment(\.dismiss) private var dismiss

    /// Controls overlay visibility (auto-hide)
    @State private var showControls = true
    @State private var controlsTimer: Timer?

    // Brightness / volume gesture state
    @State private var gestureKind: GestureKind?
    @State private var gestureBrightness: CGFloat = UIScreen.main.brightness
    @State private var gestureVolume: CGFloat = PlayerView.systemVolume

    private enum GestureKind { case brightness, volume }

    init(item: PlaylistItem, channelList: [PlaylistItem]?, existingPlayer: AVPlayer? = nil) {
        _vm = StateObject(wrappedValue: PlayerViewModel(item: item, channelList: channelList, existingPlayer: existingPlayer))
    }

    var body: some View {
        ZStack {
            // 1) Black canvas
            Color.black.ignoresSafeArea()

            // 2) Video layer
            PiPVideoSurface(player: vm.player,
                            gravity: vm.currentItem.isLive ? .resizeAspectFill : .resizeAspect,
                            pipController: $vm.pipController)
                .ignoresSafeArea()

            // 3) Gesture layer — handles tap, swipe, brightness/volume drag
            gestureLayer

            // 4) Buffering spinner
            if vm.isBuffering && vm.error == nil {
                ProgressView()
                    .scaleEffect(1.3)
                    .tint(.white)
                    .transition(.opacity)
            }

            // 5) Error overlay
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

            // 6) Controls overlay
            if showControls {
                controlsOverlay
                    .transition(.opacity)
            }

            // 7) Brightness/volume HUD
            if let kind = gestureKind {
                gestureHUD(kind: kind)
                    .transition(.opacity)
            }

            // 8) Channel name flash on switch
            if vm.showChannelFlash {
                channelFlashOverlay
                    .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }
        }
        .animation(.easeOut(duration: 0.2), value: showControls)
        .animation(.easeOut(duration: 0.2), value: vm.isBuffering)
        .animation(.easeOut(duration: 0.25), value: vm.showChannelFlash)
        .animation(.easeOut(duration: 0.15), value: gestureKind == nil)
        .statusBarHidden(!showControls)
        .preferredColorScheme(.dark)
        .persistentSystemOverlays(.hidden)
        .onAppear {
            vm.startPlayback()
            gestureBrightness = UIScreen.main.brightness
            gestureVolume = PlayerView.systemVolume
            scheduleControlsHide()
        }
        .onDisappear {
            vm.saveWatchProgress()
            vm.teardown()
        }
        .safeAreaInset(edge: .bottom) {
            if showControls && vm.hasFirstFrame {
                secondaryPanel
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: - System volume helper

    private static var systemVolume: CGFloat {
        CGFloat(AVAudioSession.sharedInstance().outputVolume)
    }

    // Hidden volume slider — the only way to set system volume programmatically
    private static let volumeView: MPVolumeView = {
        let v = MPVolumeView(frame: .init(x: -1000, y: -1000, width: 1, height: 1))
        v.isHidden = true
        return v
    }()

    private static func setSystemVolume(_ value: Float) {
        // Find the hidden UISlider inside MPVolumeView and set its value
        if let slider = volumeView.subviews.first(where: { $0 is UISlider }) as? UISlider {
            DispatchQueue.main.async {
                slider.value = max(0, min(1, value))
            }
        }
    }

    // MARK: - Gesture Layer

    private var gestureLayer: some View {
        GeometryReader { geo in
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { toggleControlsVisibility() }
                .onTapGesture(count: 2) {
                    // Double-tap left/right to seek ±10s
                }
                .gesture(
                    DragGesture(minimumDistance: 8)
                        .onChanged { value in
                            let isLeft = value.startLocation.x < geo.size.width / 2
                            let verticalDelta = -value.translation.height / geo.size.height

                            if gestureKind == nil {
                                // Only activate if gesture is more vertical than horizontal
                                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                                gestureKind = isLeft ? .brightness : .volume
                                gestureBrightness = UIScreen.main.brightness
                                gestureVolume = PlayerView.systemVolume
                            }

                            switch gestureKind {
                            case .brightness:
                                let newVal = max(0, min(1, gestureBrightness + verticalDelta))
                                UIScreen.main.brightness = newVal
                            case .volume:
                                let newVal = max(0, min(1, gestureVolume + verticalDelta))
                                PlayerView.setSystemVolume(Float(newVal))
                            case .none:
                                break
                            }
                        }
                        .onEnded { _ in
                            gestureKind = nil
                        }
                )
                .simultaneousGesture(
                    DragGesture(minimumDistance: 50)
                        .onEnded { value in
                            // Horizontal swipe for channel switching (only when not in brightness/volume mode)
                            guard gestureKind == nil else { return }
                            let horizontal = value.translation.width
                            if abs(horizontal) > abs(value.translation.height) {
                                if horizontal < -50 { vm.goNext() }
                                else if horizontal > 50 { vm.goPrev() }
                            }
                        }
                )
        }
    }

    // MARK: - Brightness / Volume HUD

    private func gestureHUD(kind: GestureKind) -> some View {
        let icon: String
        let value: CGFloat
        switch kind {
        case .brightness:
            icon = "sun.max.fill"
            value = UIScreen.main.brightness
        case .volume:
            icon = gestureVolume > 0.5 ? "speaker.wave.3.fill" : (gestureVolume > 0 ? "speaker.wave.1.fill" : "speaker.slash.fill")
            value = PlayerView.systemVolume
        }

        return VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(.white)

            // Vertical progress bar
            GeometryReader { geo in
                ZStack(alignment: .bottom) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(.white.opacity(0.15))
                    RoundedRectangle(cornerRadius: 3)
                        .fill(.white)
                        .frame(height: geo.size.height * value)
                }
            }
            .frame(width: 4, height: 100)
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - Controls Overlay (unified)

    private var controlsOverlay: some View {
        ZStack {
            // Cinematic scrim: stronger at edges, clear in center
            VStack(spacing: 0) {
                LinearGradient(colors: [.black.opacity(0.7), .black.opacity(0.1), .clear],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: 120)
                Spacer()
                LinearGradient(colors: [.clear, .black.opacity(0.15), .black.opacity(0.7)],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: 140)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)

            VStack(spacing: 0) {
                headerBar
                Spacer()
                if !vm.currentItem.isLive && vm.duration > 0 {
                    progressBar
                        .padding(.bottom, 12)
                }
                bottomBar
            }

            // Center play/pause — premium frosted glass
            centerPlayPause
        }
    }

    // MARK: - Center Play/Pause

    private var centerPlayPause: some View {
        HStack(spacing: 48) {
            if vm.hasNavigation {
                Button { vm.goPrev() } label: {
                    Image(systemName: "backward.end.fill")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(vm.prevChannel != nil ? .white : .white.opacity(0.2))
                        .frame(width: 48, height: 48)
                }
                .disabled(vm.prevChannel == nil)
            }

            Button { vm.togglePlayPause() } label: {
                Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 64, height: 64)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(
                        Circle()
                            .strokeBorder(.white.opacity(0.15), lineWidth: 0.5)
                    )
            }

            if vm.hasNavigation {
                Button { vm.goNext() } label: {
                    Image(systemName: "forward.end.fill")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(vm.nextChannel != nil ? .white : .white.opacity(0.2))
                        .frame(width: 48, height: 48)
                }
                .disabled(vm.nextChannel == nil)
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

            // AirPlay route picker — always available, system-provided
            AirPlayButton()
                .frame(width: 36, height: 36)

            // PiP button — only shown when PiP is actually ready
            if vm.pipController != nil {
                Button { vm.togglePiP() } label: {
                    Image(systemName: vm.isPiPActive ? "pip.exit" : "pip.enter")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(.ultraThinMaterial, in: Circle())
                }
            }

            if vm.hasNavigation {
                channelNavButtons
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
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

    private var bottomBar: some View {
        HStack(spacing: 12) {
            if !vm.currentItem.isLive {
                Button { vm.seekRelative(-10) } label: {
                    Image(systemName: "gobackward.10")
                        .font(.system(size: 16, weight: .medium))
                        .frame(width: 40, height: 40)
                }

                Spacer()

                Button { vm.seekRelative(10) } label: {
                    Image(systemName: "goforward.10")
                        .font(.system(size: 16, weight: .medium))
                        .frame(width: 40, height: 40)
                }
            } else {
                Spacer()
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
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
                                        CachedAsyncImage(url: logo) {
                                            EmptyView()
                                        }
                                        .aspectRatio(contentMode: .fit)
                                        .frame(width: 14, height: 14)
                                        .clipShape(RoundedRectangle(cornerRadius: 3))
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

// MARK: - PiP-Capable Video Surface

struct PiPVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    var gravity: AVLayerVideoGravity = .resizeAspect
    @Binding var pipController: AVPictureInPictureController?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> PlayerUIView {
        let view = PlayerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = gravity
        view.backgroundColor = .black
        // PiP controller is created later once player item is ready
        return view
    }

    func updateUIView(_ uiView: PlayerUIView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
        if uiView.playerLayer.videoGravity != gravity {
            uiView.playerLayer.videoGravity = gravity
        }

        // Create PiP controller once player has an active item and is ready
        if pipController == nil,
           AVPictureInPictureController.isPictureInPictureSupported(),
           player.currentItem?.status == .readyToPlay {
            let pip = AVPictureInPictureController(playerLayer: uiView.playerLayer)
            pip?.delegate = context.coordinator
            pip?.canStartPictureInPictureAutomaticallyFromInline = false
            DispatchQueue.main.async {
                pipController = pip
            }
        }
    }

    class Coordinator: NSObject, AVPictureInPictureControllerDelegate {
        func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
            print("[PiP] Will start")
        }
        func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
            print("[PiP] ✓ Started")
        }
        func pictureInPictureController(_ controller: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
            print("[PiP] ✗ Failed: \(error.localizedDescription)")
        }
        func pictureInPictureControllerWillStopPictureInPicture(_ controller: AVPictureInPictureController) {
            print("[PiP] Will stop")
        }
        func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
            print("[PiP] Stopped")
        }
        func pictureInPictureController(_ controller: AVPictureInPictureController, restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
            // Restore the player UI when user taps "return to app"
            completionHandler(true)
        }
    }
}

/// Backward-compatible simple surface (used by LiveTV inline player)
struct VideoSurface: UIViewRepresentable {
    let player: AVPlayer
    var gravity: AVLayerVideoGravity = .resizeAspect

    func makeUIView(context: Context) -> PlayerUIView {
        let view = PlayerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = gravity
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ uiView: PlayerUIView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
        if uiView.playerLayer.videoGravity != gravity {
            uiView.playerLayer.videoGravity = gravity
        }
    }
}

final class PlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

// MARK: - AirPlay Route Picker (native system UI)

/// Wraps `AVRoutePickerView` — the standard iOS control for AirPlay/external display routing.
/// Styled to match the player's frosted glass controls.
struct AirPlayButton: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.tintColor = .white
        picker.activeTintColor = UIColor(red: 0.92, green: 0.22, blue: 0.21, alpha: 1) // accent red
        picker.prioritizesVideoDevices = true
        // Remove default background so it blends with our UI
        picker.backgroundColor = .clear
        return picker
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
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

    // PiP
    @Published var pipController: AVPictureInPictureController?
    @Published var isPiPActive = false

    // Series
    @Published var seriesEpisodes: SeriesEpisodesResponse?
    @Published var isLoadingEpisodes = false
    @Published var selectedSeason = 1
    @Published var activeEpisodeId: String?

    /// Single persistent AVPlayer — reused across channel switches.
    /// When `existingPlayer` is provided (e.g. from Live TV inline), we reuse it
    /// instead of creating a new one — zero re-buffering.
    let player: AVPlayer

    /// Whether we own the player (created it) or are borrowing it from another view
    private let ownsPlayer: Bool

    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var currentIndex: Int
    private var lastHistorySave: CFAbsoluteTime = 0
    private var lifecycleObservers: [NSObjectProtocol] = []
    /// Whether playback was active before entering background (for auto-resume)
    private var wasPlayingBeforeBackground = false

    /// Cascade fallback state
    private var fallbackURLs: [URL] = []
    private var fallbackTimer: DispatchWorkItem?
    private var loadStartTime: CFAbsoluteTime = 0

    /// Timeout per source in cascade (seconds)
    private static let sourceTimeout: TimeInterval = 6
    /// Longer timeout for VOD (MP4 files need more time for moov atom + buffering)
    private static let vodSourceTimeout: TimeInterval = 12

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

    init(item: PlaylistItem, channelList: [PlaylistItem]?, existingPlayer: AVPlayer? = nil) {
        self.currentItem = item
        self.channelList = channelList
        self.displayName = item.name
        self.currentIndex = channelList?.firstIndex(where: { $0.id == item.id }) ?? -1
        if let existing = existingPlayer {
            self.player = existing
            self.ownsPlayer = false
        } else {
            let p = AVPlayer()
            p.automaticallyWaitsToMinimizeStalling = false
            self.player = p
            self.ownsPlayer = true
        }
    }

    // MARK: - Playback

    func startPlayback() {
        // Ensure audio session is active (handles mute switch, route changes)
        try? AVAudioSession.sharedInstance().setActive(true)

        if ownsPlayer {
            // Fresh player — load stream from scratch
            loadStream(for: currentItem)
        } else {
            // Borrowed player — already playing, just sync state
            hasFirstFrame = player.currentItem?.status == .readyToPlay
            isBuffering = player.timeControlStatus == .waitingToPlayAtSpecifiedRate
            isPlaying = player.timeControlStatus == .playing
        }

        setupTimeObserver()
        setupLifecycleObservers()
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
        let cascade: [URL]
        if item.isXtreamVod {
            // VOD: original format first (.mp4), then .m3u8 as fallback
            cascade = AppConfig.vodStreamCascade(for: item.resolvedStreamURL, hlsFallback: item.hlsFallbackURL)
        } else {
            // Live TV: .m3u8 only (resolvedStreamURL already converts)
            cascade = AppConfig.streamCascade(for: item.resolvedStreamURL)
        }
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
        playerItem.preferredForwardBufferDuration = currentItem.isLive ? 2 : 10

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
        let timeoutDuration = currentItem.isLive ? Self.sourceTimeout : Self.vodSourceTimeout
        let timeout = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                guard let self, !self.hasFirstFrame else { return }
                print("[Player] ⏱ Timeout (\(timeoutDuration)s) for \(host)")
                self.advanceToNextSource(lastError: "Timeout — source too slow")
            }
        }
        fallbackTimer = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + timeoutDuration, execute: timeout)

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
        if let obs = timeObserver { player.removeTimeObserver(obs) }
        statusObserver?.invalidate()
        removeLifecycleObservers()

        if ownsPlayer {
            // Stop PiP if active
            if pipController?.isPictureInPictureActive == true {
                pipController?.stopPictureInPicture()
            }
            isPiPActive = false
            // We created this player — clean it up fully
            player.pause()
            player.replaceCurrentItem(with: nil)
        }
        // Borrowed player: leave it alone — the owner (LiveTVViewModel) reclaims it
    }

    // MARK: - Lifecycle (background/foreground)

    private func setupLifecycleObservers() {
        // Foreground return — re-activate audio session and resume playback
        let fg = NotificationCenter.default.addObserver(
            forName: .appDidBecomeActive, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                try? AVAudioSession.sharedInstance().setActive(true)
                if self.wasPlayingBeforeBackground && self.player.currentItem != nil {
                    self.player.play()
                    self.isPlaying = true
                    self.wasPlayingBeforeBackground = false
                }
            }
        }
        lifecycleObservers.append(fg)

        // Background entry — record state for auto-resume
        let bg = NotificationCenter.default.addObserver(
            forName: .appDidEnterBackground, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.wasPlayingBeforeBackground = self.player.timeControlStatus == .playing
                self.saveWatchProgress()
            }
        }
        lifecycleObservers.append(bg)

        // AVAudioSession interruption (phone calls, Siri, alarms)
        let interrupt = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] notification in
            guard let self,
                  let info = notification.userInfo,
                  let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeValue)
            else { return }
            Task { @MainActor in
                switch type {
                case .began:
                    self.wasPlayingBeforeBackground = self.player.timeControlStatus == .playing
                case .ended:
                    let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                    let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                    if options.contains(.shouldResume) && self.wasPlayingBeforeBackground {
                        try? AVAudioSession.sharedInstance().setActive(true)
                        self.player.play()
                        self.isPlaying = true
                    }
                    self.wasPlayingBeforeBackground = false
                @unknown default: break
                }
            }
        }
        lifecycleObservers.append(interrupt)
    }

    private func removeLifecycleObservers() {
        lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
        lifecycleObservers.removeAll()
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

    func togglePiP() {
        guard let pip = pipController else {
            print("[PiP] Controller not ready — player item may still be loading")
            return
        }
        if pip.isPictureInPictureActive {
            pip.stopPictureInPicture()
            isPiPActive = false
        } else if pip.isPictureInPicturePossible {
            pip.startPictureInPicture()
            isPiPActive = true
        } else {
            print("[PiP] Not possible right now (isPictureInPicturePossible = false)")
        }
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
        // Try original format first (.mp4/.mkv), fall back to .m3u8
        let originalUrl = episode.streamUrl
        let ext = originalUrl.components(separatedBy: ".").last ?? ""
        let hlsFallback: String? = (ext != "m3u8") ? originalUrl.replacingOccurrences(
            of: "\\.[a-zA-Z0-9]+$",
            with: ".m3u8",
            options: .regularExpression
        ) : nil
        let cascade = AppConfig.vodStreamCascade(for: originalUrl, hlsFallback: hlsFallback)
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
