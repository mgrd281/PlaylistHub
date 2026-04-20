import Foundation
import Supabase

/// Manages URL protection — password-protects viewing of raw stream/source URLs.
@MainActor
final class URLProtectionManager: ObservableObject {
    static let shared = URLProtectionManager()

    @Published var isProtected = false
    @Published var isUnlocked = false
    @Published var isLoading = false
    @Published var error: String?

    private var supabase: SupabaseClient { SupabaseManager.shared.client }

    private init() {}

    // MARK: - Check Status

    func checkStatus() async {
        do {
            let token = try await supabase.auth.session.accessToken
            var request = URLRequest(url: apiURL)
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            let (data, _) = try await URLSession.shared.data(for: request)
            let response = try JSONDecoder().decode(StatusResponse.self, from: data)
            isProtected = response.protected
            if !isProtected { isUnlocked = false }
        } catch {
            // Silently fail — protection status defaults to false
        }
    }

    // MARK: - Set Password

    func setPassword(_ password: String) async -> Bool {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let token = try await supabase.auth.session.accessToken
            var request = URLRequest(url: apiURL)
            request.httpMethod = "POST"
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(ActionPayload(action: "set", password: password))

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode < 300 else {
                let errResp = try? JSONDecoder().decode(ErrorResponse.self, from: data)
                self.error = errResp?.error ?? "Failed to set password"
                return false
            }

            isProtected = true
            isUnlocked = true
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Verify Password (unlock URLs)

    func verify(_ password: String) async -> Bool {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let token = try await supabase.auth.session.accessToken
            var request = URLRequest(url: apiURL)
            request.httpMethod = "POST"
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(ActionPayload(action: "verify", password: password))

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode < 300 else {
                let errResp = try? JSONDecoder().decode(ErrorResponse.self, from: data)
                self.error = errResp?.error ?? "Invalid password"
                isUnlocked = false
                return false
            }

            isUnlocked = true
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Remove Protection

    func removeProtection(_ password: String) async -> Bool {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let token = try await supabase.auth.session.accessToken
            var request = URLRequest(url: apiURL)
            request.httpMethod = "DELETE"
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(["password": password])

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode < 300 else {
                let errResp = try? JSONDecoder().decode(ErrorResponse.self, from: data)
                self.error = errResp?.error ?? "Failed to remove"
                return false
            }

            isProtected = false
            isUnlocked = false
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Lock (re-lock without removing)

    func lock() {
        isUnlocked = false
    }

    // MARK: - Private

    private var apiURL: URL {
        var components = URLComponents(url: AppConfig.webAppBaseURL, resolvingAgainstBaseURL: false)!
        components.path = "/api/playlists/url-protection"
        return components.url!
    }

    private struct StatusResponse: Decodable {
        let protected: Bool  // swiftlint:disable:this identifier_name
    }

    private struct ActionPayload: Encodable {
        let action: String
        var password: String?
        var user_id: String?
    }

    private struct ErrorResponse: Decodable {
        let error: String
    }
}
