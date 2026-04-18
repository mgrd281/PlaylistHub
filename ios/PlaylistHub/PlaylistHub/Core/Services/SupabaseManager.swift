import Foundation
import Supabase

/// Central Supabase client — shared across the app.
/// Uses the same project + anon key as the web app. RLS enforces user scoping.
@MainActor
final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabaseAnonKey
        )
    }
}
