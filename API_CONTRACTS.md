# API Contracts

## Authentication

| Method | Mechanism |
|--------|-----------|
| Web | Supabase cookie session (refreshed by middleware) |
| iOS | `Authorization: Bearer <supabase_access_token>` header |

Middleware (`src/proxy.ts`): Bearer requests to `/api/*` bypass cookie auth — route handlers verify token directly.

## Public Routes (no auth)

| Route | Runtime | Purpose |
|-------|---------|---------|
| `GET /api/stream?url=<encoded>` | Edge | Proxy IPTV stream |
| `GET /api/series-episodes?url=<catalog_url>` | Edge | Resolve series episodes via Xtream API |

## Authenticated Routes

### Playlists
| Method | Route | Body/Params | Response |
|--------|-------|-------------|----------|
| `GET` | `/api/playlists` | — | `Playlist[]` |
| `POST` | `/api/playlists` | `{ name, source_url }` | `Playlist` |

### Browse
| Method | Route | Params | Response |
|--------|-------|--------|----------|
| `GET` | `/api/browse` | `?type=channel\|movie\|series` `&mode=playlists\|groups\|grouped` `&search=` `&group=` `&page=` `&limit=` `&playlist_id=` | Varies by mode |

### Devices
| Method | Route | Response |
|--------|-------|----------|
| `GET` | `/api/devices` | `Device[]` |

### Admin (requires role=admin)
| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/admin/role` | Current user's role |
| `GET` | `/api/admin/customers` | All customers with stats |
| `GET` | `/api/admin/customers/[id]` | Customer detail |
| `PATCH` | `/api/admin/customers/[id]` | Update customer role |

## Scanner Service (internal)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `GET` | `/health` | None | Health check |
| `GET` | `/stream?url=<encoded>` | Bearer token | Proxy stream via residential IP |
| `POST` | `/fetch` | Bearer token | Fetch + parse M3U/Xtream playlist |

## CF Worker

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/?url=<encoded>` | Proxy stream via Cloudflare edge |
| `GET` | `/?url=<encoded>&mode=json` | JSON passthrough (for API calls) |

## Status Codes
- `200` — success
- `206` — partial content (Range requests)
- `400` — missing/invalid params
- `401` — unauthenticated
- `403` — forbidden (wrong role / upstream block)
- `502` — all proxy strategies failed
