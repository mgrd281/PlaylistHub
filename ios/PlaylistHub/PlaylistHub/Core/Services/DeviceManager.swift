import Foundation
import UIKit
import Supabase

/// Manages device registration, credentials, and heartbeat.
/// Device identity is server-issued and stored in Keychain (persists across reinstalls).
@MainActor
final class DeviceManager: ObservableObject {
    static let shared = DeviceManager()

    // Keychain keys
    private enum Keys {
        static let deviceId = "device_id"
        static let deviceKey = "device_key"
        static let activationCode = "device_activation_code"
    }

    @Published var deviceId: String?
    @Published var deviceKey: String?
    @Published var activationCode: String?
    @Published var device: DeviceRecord?
    @Published var isRegistering = false

    private var supabase: SupabaseClient { SupabaseManager.shared.client }
    private var heartbeatTask: Task<Void, Never>?

    private init() {
        loadFromKeychain()
    }

    // MARK: - Keychain

    private func loadFromKeychain() {
        deviceId = KeychainHelper.loadString(key: Keys.deviceId)
        deviceKey = KeychainHelper.loadString(key: Keys.deviceKey)
        activationCode = KeychainHelper.loadString(key: Keys.activationCode)
    }

    private func saveToKeychain(id: String, key: String, code: String) {
        _ = KeychainHelper.save(key: Keys.deviceId, string: id)
        _ = KeychainHelper.save(key: Keys.deviceKey, string: key)
        _ = KeychainHelper.save(key: Keys.activationCode, string: code)
        deviceId = id
        deviceKey = key
        activationCode = code
    }

    func clearKeychain() {
        KeychainHelper.delete(key: Keys.deviceId)
        KeychainHelper.delete(key: Keys.deviceKey)
        KeychainHelper.delete(key: Keys.activationCode)
        deviceId = nil
        deviceKey = nil
        activationCode = nil
        device = nil
    }

    // MARK: - Registration

    /// Register this device with the server. Called after successful login.
    /// If Keychain already has valid credentials, fetches device status instead.
    func registerOrRestore() async {
        // If we already have credentials, try to fetch existing device
        if let existingId = deviceId {
            if let fetched = await fetchDevice(id: existingId) {
                device = fetched
                startHeartbeat()
                return
            }
            // Device not found on server — re-register
            clearKeychain()
        }

        await registerNewDevice()
    }

    private func registerNewDevice() async {
        isRegistering = true
        defer { isRegistering = false }

        do {
            let token = try await supabase.auth.session.accessToken

            var request = URLRequest(url: AppConfig.webAppBaseURL.appendingPathComponent("/api/devices/register"))
            request.httpMethod = "POST"
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")

            let payload = RegisterPayload(
                platform: "ios",
                model: deviceModel,
                os_version: UIDevice.current.systemVersion,
                app_version: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
                fingerprint_hash: fingerprintHash,
                device_label: deviceModel
            )
            request.httpBody = try JSONEncoder().encode(payload)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode < 300 else {
                print("[Device] Registration failed: \(String(data: data, encoding: .utf8) ?? "")")
                return
            }

            let record = try JSONDecoder.supabase.decode(DeviceRecord.self, from: data)
            saveToKeychain(id: record.id, key: record.deviceKey, code: record.activationCode)
            device = record
            startHeartbeat()
            print("[Device] Registered: \(record.id) code=\(record.activationCode)")
        } catch {
            print("[Device] Registration error: \(error)")
        }
    }

    // MARK: - Fetch Device

    private func fetchDevice(id: String) async -> DeviceRecord? {
        do {
            let token = try await supabase.auth.session.accessToken

            var request = URLRequest(url: AppConfig.webAppBaseURL.appendingPathComponent("/api/devices/\(id)"))
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }

            let wrapper = try JSONDecoder.supabase.decode(DeviceDetailResponse.self, from: data)
            return wrapper.device
        } catch {
            print("[Device] Fetch error: \(error)")
            return nil
        }
    }

    // MARK: - Heartbeat

    func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task {
            while !Task.isCancelled {
                await sendHeartbeat()
                try? await Task.sleep(for: .seconds(300)) // every 5 minutes
            }
        }
    }

    func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    private func sendHeartbeat() async {
        guard let id = deviceId else { return }
        do {
            let token = try await supabase.auth.session.accessToken

            var request = URLRequest(url: AppConfig.webAppBaseURL.appendingPathComponent("/api/devices/\(id)/heartbeat"))
            request.httpMethod = "POST"
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(["app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"])

            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                print("[Device] Heartbeat OK")
            }
        } catch {
            // Silent failure — heartbeat is best-effort
        }
    }

    // MARK: - Device Info

    var deviceModel: String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let identifier = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(validatingUTF8: $0) ?? "Unknown"
            }
        }
        return identifier
    }

    /// Stable fingerprint: vendor identifier + model. Persists across reinstalls within same vendor.
    var fingerprintHash: String {
        let vendorId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
        let raw = "\(vendorId):\(deviceModel)"
        // Simple hash — sufficient for fingerprinting, not for crypto
        var hash: UInt64 = 5381
        for byte in raw.utf8 {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return String(hash, radix: 16)
    }

    /// URL string for QR code: points to web app's device management page
    var activationURL: String? {
        guard let code = activationCode else { return nil }
        return "\(AppConfig.webAppBaseURL.absoluteString)/activate?code=\(code)"
    }
}

// MARK: - Payloads

private struct RegisterPayload: Encodable {
    let platform: String
    let model: String
    let os_version: String
    let app_version: String
    let fingerprint_hash: String
    let device_label: String
}

struct DeviceRecord: Codable, Identifiable {
    let id: String
    let userId: String?
    let deviceKey: String
    let activationCode: String
    var deviceLabel: String?
    let platform: String
    var appVersion: String?
    var model: String?
    var osVersion: String?
    var status: String
    var fingerprintHash: String?
    var reinstallCount: Int
    var activatedAt: Date?
    var lastSeenAt: Date?
    var revokedAt: Date?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, platform, model, status
        case userId = "user_id"
        case deviceKey = "device_key"
        case activationCode = "activation_code"
        case deviceLabel = "device_label"
        case appVersion = "app_version"
        case osVersion = "os_version"
        case fingerprintHash = "fingerprint_hash"
        case reinstallCount = "reinstall_count"
        case activatedAt = "activated_at"
        case lastSeenAt = "last_seen_at"
        case revokedAt = "revoked_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct DeviceDetailResponse: Codable {
    let device: DeviceRecord
}
