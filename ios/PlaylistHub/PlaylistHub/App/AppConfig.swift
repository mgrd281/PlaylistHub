import Foundation

enum AppConfig {
    static let supabaseURL = URL(string: "https://zeesajjtlkkwpruzsdnq.supabase.co")!
    static let supabaseAnonKey = "sb_publishable_P1oDy_EcWRLiFm5VPvlzwA_EhMhOLJl"

    // The web app's production URL — used for stream proxy and series episodes
    static let webAppBaseURL = URL(string: "https://playlist-hub-kappa.vercel.app")!

    // CF Worker stream proxy (direct fallback)
    static let cfWorkerURL = URL(string: "https://royal-bonus-3655.karinexshop.workers.dev")!

    static func streamProxyURL(for streamURL: String) -> URL {
        var components = URLComponents(url: webAppBaseURL.appendingPathComponent("/api/stream"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "url", value: streamURL)]
        return components.url!
    }

    static func seriesEpisodesURL(for streamURL: String) -> URL {
        var components = URLComponents(url: webAppBaseURL.appendingPathComponent("/api/series-episodes"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "url", value: streamURL)]
        return components.url!
    }
}
