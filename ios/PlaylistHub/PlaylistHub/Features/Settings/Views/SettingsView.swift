import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var deviceManager: DeviceManager
    @EnvironmentObject private var themeManager: ThemeManager
    @StateObject private var myList = MyListManager.shared
    @StateObject private var channelFavorites = ChannelFavoritesManager.shared
    @State private var showSignOutConfirm = false

    private var accent: Color { themeManager.accentColor }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {

                    // ── Profile Card ──
                    profileCard
                        .padding(.top, 8)

                    // ── Accent / Theme ──
                    settingsSection("Appearance") {
                        VStack(alignment: .leading, spacing: 14) {
                            // Header
                            HStack(spacing: 10) {
                                Image(systemName: "paintpalette.fill")
                                    .font(.system(size: 14))
                                    .foregroundStyle(accent)
                                    .frame(width: 24)
                                Text("Accent Color")
                                    .font(.subheadline.weight(.medium))
                                Spacer()
                                if !themeManager.isDefault {
                                    Button {
                                        withAnimation(.easeInOut(duration: 0.2)) {
                                            themeManager.resetToDefault()
                                        }
                                    } label: {
                                        Text("Reset")
                                            .font(.caption2.weight(.medium))
                                            .foregroundStyle(accent)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 3)
                                            .background(accent.opacity(0.12))
                                            .clipShape(Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }

                            // 9 presets + 1 custom picker — single row
                            HStack(spacing: 0) {
                                ForEach(AccentPreset.allCases) { preset in
                                    Button {
                                        withAnimation(.easeInOut(duration: 0.2)) {
                                            themeManager.selectPreset(preset)
                                        }
                                    } label: {
                                        ZStack {
                                            Circle()
                                                .fill(preset.color)
                                                .frame(width: 26, height: 26)
                                            if themeManager.matchingPreset() == preset {
                                                Circle()
                                                    .strokeBorder(.white, lineWidth: 2.5)
                                                    .frame(width: 26, height: 26)
                                                Image(systemName: "checkmark")
                                                    .font(.system(size: 9, weight: .heavy))
                                                    .foregroundStyle(.white)
                                            }
                                        }
                                    }
                                    .buttonStyle(.plain)
                                    .frame(maxWidth: .infinity)
                                }

                                // Custom color picker as 10th item
                                ZStack {
                                    // Rainbow ring hint
                                    Circle()
                                        .strokeBorder(
                                            AngularGradient(
                                                colors: [.red, .orange, .yellow, .green, .cyan, .blue, .purple, .red],
                                                center: .center
                                            ),
                                            lineWidth: 2.5
                                        )
                                        .frame(width: 26, height: 26)
                                        .allowsHitTesting(false)

                                    if themeManager.matchingPreset() == nil {
                                        Circle()
                                            .fill(themeManager.accentColor)
                                            .frame(width: 18, height: 18)
                                            .allowsHitTesting(false)
                                    }

                                    ColorPicker("", selection: $themeManager.accentColor, supportsOpacity: false)
                                        .labelsHidden()
                                        .scaleEffect(1.6)
                                        .opacity(0.02)
                                        .frame(width: 26, height: 26)
                                }
                                .frame(maxWidth: .infinity)
                            }
                        }
                        .padding(16)
                    }

                    // ── Library ──
                    settingsSection("Library") {
                        NavigationLink(destination: MyListView().environmentObject(themeManager)) {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(accent.opacity(0.12))
                                        .frame(width: 40, height: 40)
                                    Image(systemName: "plus.rectangle.on.rectangle.fill")
                                        .font(.system(size: 16))
                                        .foregroundStyle(accent)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("My List")
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(.primary)
                                    Text(myList.count == 0 ? "No saved items" : "\(myList.count) saved")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                if myList.count > 0 {
                                    Text("\(myList.count)")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(.white)
                                        .frame(minWidth: 22, minHeight: 22)
                                        .background(accent, in: Circle())
                                }

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(.quaternary)
                            }
                            .padding(14)
                        }
                        .buttonStyle(.plain)

                        NavigationLink(destination: FavoriteChannelsView().environmentObject(themeManager)) {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(.red.opacity(0.12))
                                        .frame(width: 40, height: 40)
                                    Image(systemName: "heart.fill")
                                        .font(.system(size: 16))
                                        .foregroundStyle(.red)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Favorite Channels")
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(.primary)
                                    Text(channelFavorites.count == 0 ? "No favorites" : "\(channelFavorites.count) channel\(channelFavorites.count == 1 ? "" : "s")")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                if channelFavorites.count > 0 {
                                    Text("\(channelFavorites.count)")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(.white)
                                        .frame(minWidth: 22, minHeight: 22)
                                        .background(.red, in: Circle())
                                }

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(.quaternary)
                            }
                            .padding(14)
                        }
                        .buttonStyle(.plain)
                    }

                    // ── Device ──
                    settingsSection("Device") {
                        NavigationLink(destination: DeviceInfoView().environmentObject(deviceManager)) {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(accent.opacity(0.12))
                                        .frame(width: 40, height: 40)
                                    Image(systemName: "tv.and.mediabox")
                                        .font(.system(size: 16))
                                        .foregroundStyle(accent)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Device Info")
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(.primary)
                                    if let code = deviceManager.activationCode {
                                        Text("Code: \(code)")
                                            .font(.caption2.monospaced())
                                            .foregroundStyle(.secondary)
                                    } else {
                                        Text("Not registered")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }

                                Spacer()

                                if let device = deviceManager.device {
                                    statusBadge(device.status)
                                }

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(.quaternary)
                            }
                            .padding(14)
                        }
                        .buttonStyle(.plain)
                    }

                    // ── Playback ──
                    settingsSection("Playback") {
                        VStack(spacing: 0) {
                            infoRow(icon: "play.rectangle.fill", title: "Format", value: "HLS / MP4", color: .blue)
                            Divider().padding(.leading, 50)
                            infoRow(icon: "arrow.triangle.branch", title: "Stream Proxy", badge: "Active", badgeColor: .green)
                            Divider().padding(.leading, 50)
                            infoRow(icon: "bolt.horizontal.fill", title: "Cascade", value: "Direct → CF → Vercel", color: .orange)
                        }
                        .padding(.vertical, 2)
                    }

                    // ── App Info ──
                    settingsSection("About") {
                        VStack(spacing: 0) {
                            infoRow(icon: "info.circle.fill", title: "Version", value: appVersion, color: accent)
                            Divider().padding(.leading, 50)
                            infoRow(icon: "hammer.fill", title: "Build", value: buildIdentifier, color: .orange)
                            Divider().padding(.leading, 50)
                            infoRow(icon: "server.rack", title: "Backend", value: "Supabase", color: .green)
                            Divider().padding(.leading, 50)
                            infoRow(icon: "shield.checkered", title: "Security", value: "RLS + JWT", color: .blue)
                            Divider().padding(.leading, 50)
                            infoRow(icon: "iphone", title: "Platform", value: "iOS \(UIDevice.current.systemVersion)", color: .secondary)
                        }
                        .padding(.vertical, 2)
                    }

                    // ── Admin Panel (admin only) ──
                    if authManager.isAdmin {
                        adminSection
                    }

                    // ── Account ──
                    settingsSection("Account") {
                        VStack(spacing: 0) {
                            if let joined = authManager.currentUser?.createdAt {
                                infoRow(icon: "calendar", title: "Member since", value: joined.shortString, color: .secondary)
                                Divider().padding(.leading, 50)
                            }
                            // Sign out button
                            Button(role: .destructive) {
                                showSignOutConfirm = true
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "rectangle.portrait.and.arrow.right")
                                        .font(.system(size: 14))
                                        .foregroundStyle(.red)
                                        .frame(width: 24)
                                    Text("Sign Out")
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(.red)
                                    Spacer()
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 13)
                            }
                        }
                        .padding(.vertical, 2)
                    }

                    // ── Footer ──
                    VStack(spacing: 4) {
                        Text("PlaylistHub")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text("Built with SwiftUI + Supabase")
                            .font(.system(size: 10))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.top, 8)
                    .padding(.bottom, 40)
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

    // MARK: - Profile Card

    private var profileCard: some View {
        HStack(spacing: 16) {
            // Gradient avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [accent, accent.opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                Text(initials)
                    .font(.title3.bold())
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 3) {
                if let name = authManager.currentUser?.displayName, !name.isEmpty {
                    Text(name.displayCapitalized)
                        .font(.headline)
                } else {
                    Text((authManager.currentUser?.email.components(separatedBy: "@").first ?? "User").displayCapitalized)
                        .font(.headline)
                }
                Text(authManager.currentUser?.email ?? "")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            // Pro badge placeholder
            Text("PRO")
                .font(.system(size: 9, weight: .heavy))
                .tracking(1)
                .foregroundStyle(accent)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(accent.opacity(0.12))
                .clipShape(Capsule())
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(.systemGray6).opacity(0.7))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .strokeBorder(accent.opacity(0.15), lineWidth: 1)
                )
        )
        .padding(.horizontal, 20)
    }

    // MARK: - Section Container

    private func settingsSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.secondary)
                .tracking(0.8)
                .padding(.horizontal, 24)

            content()
                .background(Color(.systemGray6).opacity(0.7))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .padding(.horizontal, 20)
        }
    }

    // MARK: - Info Row

    private func infoRow(icon: String, title: String, value: String = "", color: Color = .secondary, badge: String? = nil, badgeColor: Color = .green) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(color)
                .frame(width: 24)
            Text(title)
                .font(.subheadline)
            Spacer()
            if let badge {
                Text(badge)
                    .font(.system(size: 9, weight: .bold))
                    .textCase(.uppercase)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(badgeColor.opacity(0.15))
                    .foregroundStyle(badgeColor)
                    .clipShape(Capsule())
            } else {
                Text(value)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    // MARK: - Status Badge

    private func statusBadge(_ status: String) -> some View {
        let color: Color = status == "active" ? .green : status == "pending" ? .orange : .red
        return HStack(spacing: 3) {
            Circle()
                .fill(color)
                .frame(width: 5, height: 5)
            Text(status.capitalized)
                .font(.system(size: 8, weight: .bold))
                .textCase(.uppercase)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(color.opacity(0.1))
        .clipShape(Capsule())
    }

    // MARK: - Admin Section

    @ViewBuilder
    private var adminSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Section header with admin badge
            HStack(spacing: 8) {
                Text("ADMIN PANEL")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.secondary)
                    .tracking(0.8)

                Text("ADMIN")
                    .font(.system(size: 8, weight: .heavy))
                    .tracking(0.5)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.red.opacity(0.12))
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 24)

            VStack(spacing: 12) {
                // Account Info
                adminCard(title: "Account", icon: "person.crop.circle.fill", iconColor: accent) {
                    VStack(spacing: 0) {
                        adminRow("User ID", value: authManager.currentUser?.id.uuidString ?? "—")
                        Divider().padding(.leading, 14)
                        adminRow("Email", value: authManager.currentUser?.email ?? "—")
                        Divider().padding(.leading, 14)
                        adminRow("Display Name", value: authManager.currentUser?.displayName ?? "Not set")
                        Divider().padding(.leading, 14)
                        adminRow("Role", value: authManager.currentUser?.role?.capitalized ?? "user")
                        Divider().padding(.leading, 14)
                        adminRow("Created", value: authManager.currentUser?.createdAt.fullString ?? "—")
                        Divider().padding(.leading, 14)
                        adminRow("Updated", value: authManager.currentUser?.updatedAt.fullString ?? "—")
                    }
                }

                // System Info
                adminCard(title: "System", icon: "cpu.fill", iconColor: .orange) {
                    VStack(spacing: 0) {
                        adminRow("iOS Version", value: UIDevice.current.systemVersion)
                        Divider().padding(.leading, 14)
                        adminRow("Device Model", value: deviceModelName)
                        Divider().padding(.leading, 14)
                        adminRow("Device Name", value: UIDevice.current.name)
                        Divider().padding(.leading, 14)
                        adminRow("App Version", value: appVersion)
                        Divider().padding(.leading, 14)
                        adminRow("Build Date", value: buildIdentifier)
                        Divider().padding(.leading, 14)
                        adminRow("Bundle ID", value: Bundle.main.bundleIdentifier ?? "—")
                        Divider().padding(.leading, 14)
                        adminRow("Locale", value: Locale.current.identifier)
                        Divider().padding(.leading, 14)
                        adminRow("Timezone", value: TimeZone.current.identifier)
                    }
                }

                // Device Registration
                adminCard(title: "Device Registration", icon: "tv.and.mediabox.fill", iconColor: .green) {
                    if let device = deviceManager.device {
                        VStack(spacing: 0) {
                            adminRow("Device ID", value: device.id)
                            Divider().padding(.leading, 14)
                            adminRow("Device Key", value: device.deviceKey)
                            Divider().padding(.leading, 14)
                            adminRow("Activation Code", value: device.activationCode)
                            Divider().padding(.leading, 14)
                            adminRow("Status", value: device.status.capitalized)
                            Divider().padding(.leading, 14)
                            adminRow("Platform", value: device.platform)
                            Divider().padding(.leading, 14)
                            adminRow("Model", value: device.model ?? "—")
                            Divider().padding(.leading, 14)
                            adminRow("OS Version", value: device.osVersion ?? "—")
                            Divider().padding(.leading, 14)
                            adminRow("Fingerprint", value: device.fingerprintHash ?? "—")
                            Divider().padding(.leading, 14)
                            adminRow("Reinstalls", value: "\(device.reinstallCount)")
                            Divider().padding(.leading, 14)
                            adminRow("Activated", value: device.activatedAt?.fullString ?? "—")
                            Divider().padding(.leading, 14)
                            adminRow("Last Seen", value: device.lastSeenAt?.fullString ?? "—")
                            Divider().padding(.leading, 14)
                            adminRow("Registered", value: device.createdAt.fullString)
                        }
                    } else {
                        HStack {
                            Spacer()
                            Text("No device registered")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Spacer()
                        }
                        .padding(.vertical, 12)
                    }
                }

                // Library Stats
                adminCard(title: "Library", icon: "books.vertical.fill", iconColor: .purple) {
                    VStack(spacing: 0) {
                        adminRow("My List", value: "\(myList.count) items")
                        Divider().padding(.leading, 14)
                        adminRow("Favorite Channels", value: "\(channelFavorites.count) channels")
                        Divider().padding(.leading, 14)
                        adminRow("Theme", value: themeManager.isDefault ? "Default" : "Custom")
                        Divider().padding(.leading, 14)
                        adminRow("Accent Color", value: themeManager.matchingPreset()?.rawValue.capitalized ?? "Custom")
                    }
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func adminCard<Content: View>(title: String, icon: String, iconColor: Color, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Card header
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iconColor)
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.primary)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)

            content()
        }
        .background(Color(.systemGray6).opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(.red.opacity(0.08), lineWidth: 1)
        )
    }

    private func adminRow(_ title: String, value: String) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(size: 11, weight: .medium).monospaced())
                .foregroundStyle(.primary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private var deviceModelName: String {
        var systemInfo = utsname()
        uname(&systemInfo)
        return withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(validatingUTF8: $0) ?? UIDevice.current.model
            }
        }
    }

    // MARK: - Helpers

    private var initials: String {
        if let name = authManager.currentUser?.displayName, !name.isEmpty {
            return String(name.prefix(2)).uppercased()
        }
        if let email = authManager.currentUser?.email {
            return String(email.prefix(2)).uppercased()
        }
        return "PH"
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    /// Unique build identifier — compile-time timestamp ensures every build is distinguishable
    private var buildIdentifier: String {
        let date = BuildInfo.compileDate
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, HH:mm"
        return formatter.string(from: date)
    }
}

#Preview {
    SettingsView()
        .environmentObject(AuthManager.shared)
}
