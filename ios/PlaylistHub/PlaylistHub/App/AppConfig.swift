import Foundation

enum AppConfig {
    static let supabaseURL = URL(string: "https://zeesajjtlkkwpruzsdnq.supabase.co")!
    static let supabaseAnonKey = "sb_publishable_P1oDy_EcWRLiFm5VPvlzwA_EhMhOLJl"

    // The web app's production URL — used for stream proxy and series episodes
    static let webAppBaseURL = URL(string: "https://playlist-hub-kappa.vercel.app")!

    // CF Worker stream proxy (direct fallback — single hop through CF edge)
    static let cfWorkerURL = URL(string: "https://iptv-proxy.karinexshop.workers.dev")!

    /// Vercel stream proxy (multi-hop — slowest, last resort)
    static func streamProxyURL(for streamURL: String) -> URL {
        var components = URLComponents(url: webAppBaseURL.appendingPathComponent("/api/stream"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "url", value: streamURL)]
        return components.url!
    }

    /// CF Worker stream proxy (single hop through Cloudflare edge)
    static func cfWorkerStreamURL(for streamURL: String) -> URL {
        var components = URLComponents(url: cfWorkerURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "url", value: streamURL)]
        return components.url!
    }

    /// Build fast-start URL cascade: direct → CF Worker → Vercel proxy
    /// Direct is fastest (0 hops from residential IP), CF is 1 hop, Vercel is 2+ hops.
    static func streamCascade(for streamURL: String) -> [URL] {
        var urls: [URL] = []
        if let direct = URL(string: streamURL) { urls.append(direct) }
        urls.append(cfWorkerStreamURL(for: streamURL))
        urls.append(streamProxyURL(for: streamURL))
        return urls
    }

    static func seriesEpisodesURL(for streamURL: String) -> URL {
        var components = URLComponents(url: webAppBaseURL.appendingPathComponent("/api/series-episodes"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "url", value: streamURL)]
        return components.url!
    }
}
