# System Architecture

## Layer Overview

```
┌─────────────┐     ┌─────────────┐
│  iOS App    │     │  Web App    │
│  (SwiftUI)  │     │  (Next.js)  │
└──────┬──────┘     └──────┬──────┘
       │                   │
       │  Bearer token     │  Cookie auth
       ▼                   ▼
┌──────────────────────────────────┐
│        Vercel Edge API           │
│  /api/stream   /api/browse       │
│  /api/playlists /api/devices     │
│  /api/series-episodes /api/admin │
└──────────┬───────────────────────┘
           │
     ┌─────┼──────────────┐
     ▼     ▼              ▼
┌────────┐ ┌────────────┐ ┌──────────┐
│CF Worker│ │Scanner Svc │ │ Direct   │
│(1-hop)  │ │(residential│ │ fetch    │
│         │ │ IP proxy)  │ │          │
└────┬────┘ └─────┬──────┘ └────┬─────┘
     │            │              │
     └────────────┼──────────────┘
                  ▼
         ┌──────────────┐
         │ IPTV Provider │
         │ (e.g. dksip)  │
         └──────────────┘
```

## Stream Proxy Pipeline

The `/api/stream` route races all strategies in parallel:

| Priority | Strategy | Path | When it works |
|----------|----------|------|---------------|
| 1 | Scanner Service | Vercel → cloudflared tunnel → local Node.js → provider | Always (residential IP) |
| 2 | CF Worker | Vercel → Cloudflare edge → provider | When provider doesn't block CF IPs |
| 3 | Direct | Vercel → provider | When provider doesn't block Vercel IPs |

First successful response (valid media payload) wins via `Promise.any()`.

### Payload Validation (`isUsableStreamPayload`)
All proxy layers validate upstream responses:
- Reject HTML, JSON, XML content types
- For HLS manifests: verify `#EXTM3U` / `#EXT-X-` markers
- For `text/*`: reject error keywords (forbidden, not found, access denied)

### HLS Manifest Rewriting
When proxying `.m3u8` manifests, all segment/playlist URLs are rewritten to route back through `/api/stream` to maintain the proxy chain.

## Data Flow

```
User adds playlist URL
  → POST /api/playlists (creates record, status=pending)
  → Scanner Service /fetch (parses M3U, classifies items)
  → Items stored in playlist_items table
  → GET /api/browse returns categorized content
  → Click play → /api/stream proxies the stream
```

## iOS Stream Cascade

```swift
AppConfig.streamCascade(for: url) → [
  url,                                    // direct
  cfWorkerStreamURL(for: url),            // CF worker
  "\(webAppURL)/api/stream?url=\(url)"    // Vercel proxy
]
```
PlayerView tries each URL sequentially; first that plays wins.

## Key Services

| Service | Location | Runtime |
|---------|----------|---------|
| Web App | `src/` | Vercel (Edge + Node) |
| CF Worker | `cf-proxy/worker.js` | Cloudflare Workers |
| Scanner Service | `scanner-service/server.js` | Node.js on VPS/local + cloudflared tunnel |
| iOS App | `ios/PlaylistHub/` | Swift/SwiftUI |
| Database | Supabase | PostgreSQL |

## Content Classification

`src/lib/parser/classifier.ts` — priority order:
1. **URL path** (highest): `/movie/` `/vod/` → movie; `/series/` → series; `/live/` `.ts` → channel
2. **Group title keywords** (multilingual EN/DE/ES)
3. **Name + URL regex** (year patterns, resolution, S01E01)
4. **Score-based fallback** → `uncategorized`
