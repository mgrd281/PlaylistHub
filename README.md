# PlaylistHub

Multi-platform IPTV playlist manager — import M3U/Xtream playlists, browse channels/movies/series, and stream through a resilient multi-hop proxy pipeline.

## Stack

| Layer | Tech |
|-------|------|
| Web | Next.js 16.2.4 (App Router, Edge Runtime), React 19, Tailwind 4, shadcn/ui |
| State | Zustand |
| Auth | Supabase Auth (PKCE) |
| DB | Supabase PostgreSQL (RLS) |
| Stream Proxy | Cloudflare Worker → Scanner Service → Direct |
| iOS | SwiftUI + AVPlayer + Supabase Swift SDK |
| Hosting | Vercel (web), Cloudflare Workers (proxy), Oracle/VPS (scanner) |

## Quick Start

```bash
cp .env.example .env.local   # fill in Supabase + scanner keys
npm install
npm run dev                   # http://localhost:3000
```

## Architecture

See [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) for the full data-flow diagram and proxy pipeline.

## Governance Docs

| Doc | Purpose |
|-----|---------|
| [PROJECT_BRIEF.md](PROJECT_BRIEF.md) | Product vision and scope |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Layers, data flow, proxy pipeline |
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Feature requirements |
| [API_CONTRACTS.md](API_CONTRACTS.md) | API endpoint contracts |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Tables, RLS, migrations |
| [SECURITY_RULES.md](SECURITY_RULES.md) | Auth, RLS, token rules |
| [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md) | Design system and patterns |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deploy workflow and env vars |
| [AI_RULES.md](AI_RULES.md) | Agent operating rules |
| [TASK_EXECUTION_PROTOCOL.md](TASK_EXECUTION_PROTOCOL.md) | Workflow for every task |
| [CHANGELOG.md](CHANGELOG.md) | Change history |
