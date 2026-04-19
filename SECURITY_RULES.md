# Security Rules

## Authentication
- **Web**: Supabase PKCE flow → cookie session, refreshed by middleware on every request
- **iOS**: Supabase SDK → Bearer token in Authorization header
- **Admin**: role check via service-role client reading `profiles.role`

## Middleware (`src/proxy.ts`)
- Matcher excludes: `/api/stream`, `/api/series-episodes`, static assets
- Bearer-header requests to `/api/*` skip cookie refresh (route handlers verify token)
- All other `/api/*` and dashboard routes require valid session → redirect to `/login`

## Row-Level Security
Every user-facing table has RLS enabled:
- Users can only CRUD their own data (`auth.uid() = user_id`)
- Nested tables (items, scans, categories) check via subquery on playlists
- Admin operations use service-role client (bypasses RLS)

## Scanner Service Auth
- Token-based: `Authorization: Bearer <token>` or `?token=<token>`
- Token list in `SCANNER_API_TOKEN` env var (comma-separated)
- Enforcement toggleable via `SCANNER_API_ENFORCE_TOKEN`

## Stream Proxy
- `/api/stream` is public (no auth) — intentional for player compatibility
- Payload validation (`isUsableStreamPayload`) prevents serving HTML/JSON error pages as media
- CF Worker has optional `X-Proxy-Token` header (currently unused)

## Secrets (env vars — never commit)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client-safe
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS
- `SCANNER_API_TOKEN` — scanner auth
- `SCANNER_API_URL`, `SCANNER_STREAM_URL` — scanner endpoints
- `STREAM_PROXY_URL` — CF worker URL

## CORS
- `/api/stream`: `Access-Control-Allow-Origin: *` (required for cross-origin video)
- CF Worker: `Access-Control-Allow-Origin: *`
- Other API routes: default (same-origin)
