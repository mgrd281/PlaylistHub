import Foundation
import Supabase
import AuthenticationServices

/// Manages authentication state. Uses Supabase Auth directly (JWT, not cookies).
@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published var isAuthenticated = false
    @Published var currentUser: Profile?
    @Published var isLoading = false
    @Published var error: String?

    private var supabase: SupabaseClient { SupabaseManager.shared.client }

    private init() {}

    // MARK: - Session Restore

    func restoreSession() async {
        do {
            let session = try await supabase.auth.session
            isAuthenticated = true
            await fetchProfile(userId: session.user.id)
        } catch {
            isAuthenticated = false
            currentUser = nil
        }
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) async {
        guard !email.isEmpty, !password.isEmpty else {
            self.error = "Please enter email and password."
            return
        }
        isLoading = true
        error = nil
        do {
            let session = try await supabase.auth.signIn(email: email, password: password)
            isAuthenticated = true
            await fetchProfile(userId: session.user.id)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Sign Up

    func signUp(email: String, password: String) async {
        guard !email.isEmpty, !password.isEmpty else {
            self.error = "Please enter email and password."
            return
        }
        guard password.count >= 6 else {
            self.error = "Password must be at least 6 characters."
            return
        }
        isLoading = true
        error = nil
        do {
            let response = try await supabase.auth.signUp(email: email, password: password)
            if response.session != nil {
                isAuthenticated = true
                await fetchProfile(userId: response.user.id)
            } else {
                self.error = "Check your email for a confirmation link."
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Sign Out

    func signOut() async {
        do {
            try await supabase.auth.signOut()
        } catch {
            // Best-effort sign out
        }
        isAuthenticated = false
        currentUser = nil
    }

    // MARK: - Profile

    private func fetchProfile(userId: UUID) async {
        do {
            let profile: Profile = try await supabase
                .from("profiles")
                .select()
                .eq("id", value: userId.uuidString)
                .single()
                .execute()
                .value
            currentUser = profile
        } catch {
            // Profile may not exist yet (auto-created by trigger)
            currentUser = nil
        }
    }
}
