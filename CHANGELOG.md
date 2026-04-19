# Changelog

## 2026-04-19 — Playback Pipeline Root-Cause Repair

### Fixed
- **Payload validation**: Added `isUsableStreamPayload()` to all 3 proxy layers (Vercel, CF Worker, Scanner) — rejects HTML/JSON/XML error pages masquerading as media
- **CF Worker endpoint**: Updated iOS `AppConfig.cfWorkerURL` to `iptv-proxy.karinexshop.workers.dev` (was stale `royal-bonus-3655`)
- **Series episode resolver**: Added to middleware bypass matcher; added Bearer token forwarding for iOS; added `mode=json` CF Worker passthrough
- **Content classifier**: URL-path classification now takes priority over group keyword matching — prevents `/live/` URLs being mislabeled as movie/series
- **CF Worker fallback**: Hardcoded fallback worker URL in stream route to survive stale env vars

### Architecture
- Stream proxy now races Scanner + CF Worker + Direct in parallel via `Promise.any()`
- Scanner Service is the only reliable path when provider blocks datacenter IPs
- Scanner runs on residential IP via cloudflared tunnel

### Verified
- Movie stream (522804.mp4): HTTP 206, video/mp4, 65KB ✓
- Series episode stream (394907.mp4): HTTP 206, video/mp4, 65KB ✓
- Series episode resolver: HTTP 200, real episode data ✓

### Commits
- `067b20e` — Initial playback pipeline hardening
- `8ff1819` — Harden playback pipeline against stale worker endpoint  
- `f3bf008` — Fix series auth redirect + robust content mapping
- `fcd4704` — Fix series episode resolver proxy mode (JSON passthrough)

## 2026-04-19 — Governance Docs Bootstrap
- Created PROJECT_BRIEF, SYSTEM_ARCHITECTURE, PRODUCT_REQUIREMENTS, API_CONTRACTS, DATABASE_SCHEMA, SECURITY_RULES, UI_UX_GUIDELINES, DEPLOYMENT, AI_RULES, TASK_EXECUTION_PROTOCOL, CHANGELOG
- Replaced default README with project-specific documentation
