import SwiftUI
import CoreImage.CIFilterBuiltins

/// Full-screen device info view showing device ID, activation code, QR code.
/// Designed like a professional TV app activation screen.
struct DeviceInfoView: View {
    @EnvironmentObject private var deviceManager: DeviceManager
    @State private var copied: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 6) {
                    Image(systemName: "tv.and.mediabox")
                        .font(.system(size: 40))
                        .foregroundStyle(.red)
                    Text("Device Info")
                        .font(.title2.weight(.bold))
                    Text("Use this info to manage your device from the web")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 8)

                // Status badge
                if let device = deviceManager.device {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(statusColor(device.status))
                            .frame(width: 8, height: 8)
                        Text(device.status.capitalized)
                            .font(.caption.weight(.semibold))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(statusColor(device.status).opacity(0.12))
                    .clipShape(Capsule())
                }

                // QR Code
                if let url = deviceManager.activationURL, let qrImage = generateQRCode(from: url) {
                    VStack(spacing: 10) {
                        Image(uiImage: qrImage)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 180, height: 180)
                            .padding(16)
                            .background(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                        Text("Scan to manage on web")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                // Website URL
                infoCard(
                    icon: "globe",
                    label: "Website",
                    value: AppConfig.webAppBaseURL.host ?? AppConfig.webAppBaseURL.absoluteString
                )

                // Device ID
                if let id = deviceManager.deviceId {
                    infoCard(icon: "cpu", label: "Device ID", value: id, copyable: true)
                }

                // Activation Code
                if let code = deviceManager.activationCode {
                    VStack(spacing: 8) {
                        Text("Activation Code")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Text(code)
                            .font(.system(size: 32, weight: .bold, design: .monospaced))
                            .tracking(4)
                            .foregroundStyle(.red)

                        Button {
                            UIPasteboard.general.string = code
                            withAnimation { copied = "code" }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                withAnimation { if copied == "code" { copied = nil } }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: copied == "code" ? "checkmark" : "doc.on.doc")
                                    .font(.system(size: 11))
                                Text(copied == "code" ? "Copied!" : "Copy Code")
                                    .font(.caption2.weight(.medium))
                            }
                            .foregroundStyle(copied == "code" ? .green : .secondary)
                        }
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 20)
                }

                // Device Key (truncated)
                if let key = deviceManager.deviceKey {
                    infoCard(
                        icon: "key.fill",
                        label: "Device Key",
                        value: String(key.prefix(16)) + "…",
                        copyable: true,
                        fullCopyValue: key
                    )
                }

                // Device Details
                if let device = deviceManager.device {
                    VStack(spacing: 0) {
                        detailRow(label: "Platform", value: device.platform.uppercased())
                        Divider().padding(.leading, 16)
                        detailRow(label: "Model", value: device.model ?? "Unknown")
                        Divider().padding(.leading, 16)
                        detailRow(label: "App Version", value: device.appVersion ?? "1.0.0")
                        Divider().padding(.leading, 16)
                        detailRow(label: "Registered", value: device.createdAt.relativeString)
                        if let lastSeen = device.lastSeenAt {
                            Divider().padding(.leading, 16)
                            detailRow(label: "Last Seen", value: lastSeen.relativeString)
                        }
                        if device.reinstallCount > 0 {
                            Divider().padding(.leading, 16)
                            detailRow(label: "Reinstalls", value: "\(device.reinstallCount)")
                        }
                    }
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 20)
                }

                // Refresh button
                Button {
                    Task { await deviceManager.registerOrRestore() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 13))
                        Text("Refresh")
                            .font(.subheadline.weight(.medium))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
        .navigationTitle("Device")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Components

    private func infoCard(icon: String, label: String, value: String, copyable: Bool = false, fullCopyValue: String? = nil) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.caption.weight(.medium).monospaced())
                    .lineLimit(1)
            }

            Spacer()

            if copyable {
                let copyKey = label.lowercased()
                Button {
                    UIPasteboard.general.string = fullCopyValue ?? value
                    withAnimation { copied = copyKey }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { if copied == copyKey { copied = nil } }
                    }
                } label: {
                    Image(systemName: copied == copyKey ? "checkmark.circle.fill" : "doc.on.doc")
                        .font(.system(size: 14))
                        .foregroundStyle(copied == copyKey ? .green : .secondary)
                }
            }
        }
        .padding(16)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 20)
    }

    private func detailRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption)
                .foregroundStyle(.primary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - QR Code

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let output = filter.outputImage else { return nil }
        let scale = 256.0 / output.extent.size.width
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))

        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Helpers

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "active": return .green
        case "pending": return .orange
        case "revoked": return .red
        case "expired": return .gray
        default: return .secondary
        }
    }
}
