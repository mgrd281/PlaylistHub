import Foundation

// MARK: - Enums

enum PlaylistType: String, Codable, CaseIterable {
    case m3u = "M3U"
    case m3u8 = "M3U8"
    case xtream = "XTREAM"
}

enum PlaylistStatus: String, Codable {
    case pending, scanning, active, error, inactive
}

enum ContentType: String, Codable, CaseIterable {
    case channel, movie, series, uncategorized

    var displayName: String {
        switch self {
        case .channel: return "Channels"
        case .movie: return "Movies"
        case .series: return "Series"
        case .uncategorized: return "Other"
        }
    }

    var iconName: String {
        switch self {
        case .channel: return "tv.fill"
        case .movie: return "film.fill"
        case .series: return "rectangle.stack.fill"
        case .uncategorized: return "square.stack.fill"
        }
    }
}

// MARK: - Models

struct Profile: Codable, Identifiable {
    let id: UUID
    let email: String
    var displayName: String?
    var avatarUrl: String?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, email
        case displayName = "display_name"
        case avatarUrl = "avatar_url"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct Playlist: Codable, Identifiable {
    let id: UUID
    let userId: UUID
    var name: String
    let sourceUrl: String
    let type: PlaylistType
    var status: PlaylistStatus
    var totalItems: Int
    var channelsCount: Int
    var moviesCount: Int
    var seriesCount: Int
    var categoriesCount: Int
    var lastScanAt: Date?
    var errorMessage: String?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, type, status
        case userId = "user_id"
        case sourceUrl = "source_url"
        case totalItems = "total_items"
        case channelsCount = "channels_count"
        case moviesCount = "movies_count"
        case seriesCount = "series_count"
        case categoriesCount = "categories_count"
        case lastScanAt = "last_scan_at"
        case errorMessage = "error_message"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct PlaylistItem: Codable, Identifiable {
    let id: UUID
    let playlistId: UUID
    var scanId: UUID?
    var categoryId: UUID?
    let name: String
    let streamUrl: String
    var logoUrl: String?
    var groupTitle: String?
    let contentType: ContentType
    var tvgId: String?
    var tvgName: String?
    var tvgLogo: String?
    var metadata: [String: AnyCodable]?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, metadata
        case playlistId = "playlist_id"
        case scanId = "scan_id"
        case categoryId = "category_id"
        case streamUrl = "stream_url"
        case logoUrl = "logo_url"
        case groupTitle = "group_title"
        case contentType = "content_type"
        case tvgId = "tvg_id"
        case tvgName = "tvg_name"
        case tvgLogo = "tvg_logo"
        case createdAt = "created_at"
    }

    var resolvedLogoURL: URL? {
        if let tvgLogo, let url = URL(string: tvgLogo) { return url }
        if let logoUrl, let url = URL(string: logoUrl) { return url }
        return nil
    }

    var isLive: Bool {
        contentType == .channel || streamUrl.contains("/live/")
    }

    var proxiedStreamURL: URL {
        AppConfig.streamProxyURL(for: resolvedStreamURL)
    }

    /// Whether this URL looks like an Xtream-codes provider endpoint
    private var isXtreamURL: Bool {
        streamUrl.contains("/live/") || streamUrl.contains("/movie/") || streamUrl.contains("/series/")
    }

    /// Whether this is an Xtream VOD item (movie or series — NOT live)
    var isXtreamVod: Bool {
        guard streamUrl.contains("/movie/") || streamUrl.contains("/series/") else { return false }
        return streamUrl.range(of: #"/(?:movie|series)/[^/]+/[^/]+/\d+\.\w+$"#, options: .regularExpression) != nil
    }

    var resolvedStreamURL: String {
        // Only force .m3u8 for LIVE channels — Xtream always serves /live/ as HLS.
        // Movies & series: keep original container (.mp4/.mkv/.ts) — most Xtream
        // servers do NOT support HLS conversion for VOD content.
        if isLive && isXtreamURL {
            let ext = streamUrl.components(separatedBy: ".").last ?? ""
            if ext != "m3u8" {
                return streamUrl.replacingOccurrences(
                    of: "\\.[a-zA-Z0-9]+$",
                    with: ".m3u8",
                    options: .regularExpression
                )
            }
        }
        return streamUrl
    }

    /// HLS version of the URL — used as fallback for VOD when original format fails
    var hlsFallbackURL: String? {
        guard isXtreamVod else { return nil }
        let ext = streamUrl.components(separatedBy: ".").last ?? ""
        guard ext != "m3u8" else { return nil }
        return streamUrl.replacingOccurrences(
            of: "\\.[a-zA-Z0-9]+$",
            with: ".m3u8",
            options: .regularExpression
        )
    }
}

struct Category: Codable, Identifiable {
    let id: UUID
    let playlistId: UUID
    let name: String
    var itemCount: Int
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name
        case playlistId = "playlist_id"
        case itemCount = "item_count"
        case createdAt = "created_at"
    }
}

struct PlaylistScan: Codable, Identifiable {
    let id: UUID
    let playlistId: UUID
    var status: String
    var totalItems: Int
    var channelsCount: Int
    var moviesCount: Int
    var seriesCount: Int
    var categoriesCount: Int
    var errorMessage: String?
    let startedAt: Date
    var completedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, status
        case playlistId = "playlist_id"
        case totalItems = "total_items"
        case channelsCount = "channels_count"
        case moviesCount = "movies_count"
        case seriesCount = "series_count"
        case categoriesCount = "categories_count"
        case errorMessage = "error_message"
        case startedAt = "started_at"
        case completedAt = "completed_at"
    }
}

// MARK: - API Response types

struct GroupInfo: Codable {
    let name: String
    let count: Int
    let samples: [String]?
}

struct GroupsResponse: Codable {
    let groups: [GroupInfo]
    let total: Int
}

struct ItemsResponse: Codable {
    let items: [PlaylistItem]
    let total: Int
    let page: Int
    let limit: Int
    let totalPages: Int
}

struct SeriesEpisodesResponse: Codable {
    let seriesId: String?
    let seriesName: String?
    let seasons: [SeasonData]
}

struct SeasonData: Codable {
    let season: Int
    let episodes: [EpisodeData]
}

struct EpisodeData: Codable, Identifiable {
    let id: String
    let title: String
    let season: Int
    let episode: Int
    let streamUrl: String
    var info: EpisodeInfo?
}

struct EpisodeInfo: Codable {
    var duration: String?
    var plot: String?
    var rating: String?
}

// MARK: - AnyCodable helper for metadata JSONB

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) { value = s }
        else if let i = try? container.decode(Int.self) { value = i }
        else if let d = try? container.decode(Double.self) { value = d }
        else if let b = try? container.decode(Bool.self) { value = b }
        else { value = "" }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let s = value as? String { try container.encode(s) }
        else if let i = value as? Int { try container.encode(i) }
        else if let d = value as? Double { try container.encode(d) }
        else if let b = value as? Bool { try container.encode(b) }
        else { try container.encode("\(value)") }
    }
}
