# Deployment

## Web App (Vercel)
- **URL**: https://playlist-hub-kappa.vercel.app
- **Git**: https://github.com/mgrd281/PlaylistHub.git (main branch)
- **Deploy**: `npx vercel --prod --yes` or push to main (auto-deploy via Vercel GitHub integration)
- **Build**: `next build` (Turbopack)

### Vercel Env Vars
| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations |
| `SCANNER_API_URL` | Primary scanner endpoint |
| `SCANNER_STREAM_URL` | Secondary scanner (cloudflared tunnel) |
| `SCANNER_API_TOKEN` | Bearer token for scanner auth |
| `STREAM_PROXY_URL` | CF Worker URL |

## Cloudflare Worker
- **URL**: https://iptv-proxy.karinexshop.workers.dev
- **Source**: `cf-proxy/worker.js`
- **Deploy**: `cd cf-proxy && npx wrangler deploy`
- **Config**: `cf-proxy/wrangler.toml`

## Scanner Service
- **Source**: `scanner-service/server.js`
- **Run**: `cd scanner-service && npm start` (port 8787)
- **Tunnel**: `cloudflared tunnel --url http://localhost:8787`
- **Note**: Tunnel URL is ephemeral (trycloudflare.com) — update `SCANNER_STREAM_URL` on Vercel after restart
- **Docker**: `docker build -t scanner . && docker run -p 8787:8787 scanner`

## iOS App
- **Source**: `ios/PlaylistHub/`
- **Build**: Xcode → PlaylistHub scheme
- **Config**: `AppConfig.swift` contains Supabase + API URLs
- **Key values to update on infra changes**:
  - `supabaseURL` — Supabase project URL
  - `webAppURL` — Vercel deployment URL  
  - `cfWorkerURL` — CF Worker URL

## Supabase
- **Project**: zeesajjtlkkwpruzsdnq
- **Schema**: `supabase/schema.sql`
- **Migrations**: `supabase/migration_devices.sql`
- **Apply**: Run SQL files in Supabase SQL Editor

## Deployment Checklist
1. `npm run build` — verify no errors
2. `git add -A && git commit && git push`
3. Verify Vercel auto-deploy or run `npx vercel --prod --yes`
4. If CF Worker changed: `cd cf-proxy && npx wrangler deploy`
5. If scanner changed: restart service + update tunnel URL in Vercel env
6. If iOS changed: update AppConfig if URLs changed, build in Xcode
