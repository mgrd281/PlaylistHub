import Foundation
import Supabase

/// Data service — talks directly to Supabase (RLS-protected). Reuses the same DB as the web app.
@MainActor
final class DataService: ObservableObject {
    static let shared = DataService()

    private var supabase: SupabaseClient { SupabaseManager.shared.client }

    // MARK: - Playlists

    func fetchPlaylists() async throws -> [Playlist] {
        try await supabase
            .from("playlists")
            .select()
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    func fetchPlaylist(id: UUID) async throws -> Playlist {
        try await supabase
            .from("playlists")
            .select()
            .eq("id", value: id.uuidString)
            .single()
            .execute()
            .value
    }

    func createPlaylist(name: String, sourceUrl: String) async throws -> Playlist {
        let userId = try await supabase.auth.session.user.id

        struct InsertPayload: Encodable {
            let user_id: String
            let name: String
            let source_url: String
            let type: String
        }

        let detectedType = sourceUrl.lowercased().contains("get.php") ? "XTREAM" :
                           sourceUrl.lowercased().hasSuffix(".m3u8") ? "M3U8" : "M3U"

        return try await supabase
            .from("playlists")
            .insert(InsertPayload(
                user_id: userId.uuidString,
                name: name,
                source_url: sourceUrl,
                type: detectedType
            ))
            .select()
            .single()
            .execute()
            .value
    }

    func deletePlaylist(id: UUID) async throws {
        try await supabase
            .from("playlists")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Items

    func fetchItems(
        playlistId: UUID,
        contentType: ContentType? = nil,
        search: String? = nil,
        groupTitle: String? = nil,
        page: Int = 1,
        limit: Int = 50
    ) async throws -> ItemsResponse {
        var query = supabase
            .from("playlist_items")
            .select("*", head: false)
            .eq("playlist_id", value: playlistId.uuidString)

        if let contentType {
            query = query.eq("content_type", value: contentType.rawValue)
        }
        if let search, !search.isEmpty {
            query = query.or("name.ilike.%\(search)%,group_title.ilike.%\(search)%")
        }
        if let groupTitle {
            if groupTitle == "__ungrouped__" {
                query = query.is("group_title", value: nil)
            } else {
                query = query.eq("group_title", value: groupTitle)
            }
        }

        let offset = (page - 1) * limit

        // Get count
        let countResult: Int = try await supabase
            .from("playlist_items")
            .select("*", head: true, count: .exact)
            .eq("playlist_id", value: playlistId.uuidString)
            .execute()
            .count ?? 0

        let items: [PlaylistItem] = try await query
            .order("name")
            .range(from: offset, to: offset + limit - 1)
            .execute()
            .value

        let totalPages = max(1, Int(ceil(Double(countResult) / Double(limit))))
        return ItemsResponse(items: items, total: countResult, page: page, limit: limit, totalPages: totalPages)
    }

    /// Fetch items for a specific group (used for channel browser context)
    func fetchGroupItems(playlistId: UUID, groupTitle: String) async throws -> [PlaylistItem] {
        if groupTitle == "__ungrouped__" {
            return try await supabase
                .from("playlist_items")
                .select()
                .eq("playlist_id", value: playlistId.uuidString)
                .eq("content_type", value: "channel")
                .is("group_title", value: nil)
                .order("name")
                .limit(200)
                .execute()
                .value
        }
        return try await supabase
            .from("playlist_items")
            .select()
            .eq("playlist_id", value: playlistId.uuidString)
            .eq("content_type", value: "channel")
            .eq("group_title", value: groupTitle)
            .order("name")
            .limit(200)
            .execute()
            .value
    }

    // MARK: - Groups (aggregated)

    func fetchGroups(playlistId: UUID, contentType: ContentType = .channel) async throws -> [GroupInfo] {
        // Supabase doesn't support GROUP BY easily via the client, so use RPC or fetch via API.
        // Fallback: call the web app's API
        var components = URLComponents(url: AppConfig.webAppBaseURL, resolvingAgainstBaseURL: false)!
        components.path = "/api/playlists/\(playlistId.uuidString)/items"
        components.queryItems = [
            URLQueryItem(name: "mode", value: "groups"),
            URLQueryItem(name: "type", value: contentType.rawValue),
        ]

        var request = URLRequest(url: components.url!)
        if let token = try? await supabase.auth.session.accessToken {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder.supabase.decode(GroupsResponse.self, from: data)
        return response.groups
    }

    // MARK: - Categories

    func fetchCategories(playlistId: UUID) async throws -> [Category] {
        try await supabase
            .from("categories")
            .select()
            .eq("playlist_id", value: playlistId.uuidString)
            .order("name")
            .execute()
            .value
    }

    // MARK: - Scan (calls the web app API — needs the M3U parser on server)

    func scanPlaylist(id: UUID) async throws {
        var components = URLComponents(url: AppConfig.webAppBaseURL, resolvingAgainstBaseURL: false)!
        components.path = "/api/playlists/\(id.uuidString)/scan"

        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = try? await supabase.auth.session.accessToken {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode < 300 else {
            throw NSError(domain: "PlaylistHub", code: 1, userInfo: [NSLocalizedDescriptionKey: "Scan failed"])
        }
    }

    // MARK: - Series Episodes

    func fetchSeriesEpisodes(streamUrl: String) async throws -> SeriesEpisodesResponse {
        let url = AppConfig.seriesEpisodesURL(for: streamUrl)
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder.supabase.decode(SeriesEpisodesResponse.self, from: data)
    }
}

// MARK: - JSONDecoder for Supabase date formats

extension JSONDecoder {
    static let supabase: JSONDecoder = {
        let decoder = JSONDecoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = formatter.date(from: string) { return date }
            if let date = fallback.date(from: string) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(string)")
        }
        return decoder
    }()
}
