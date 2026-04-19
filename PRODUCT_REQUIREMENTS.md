# Product Requirements

## P0 — Must Have
- [x] User auth (email/password, OAuth via Supabase PKCE)
- [x] Add M3U/Xtream playlist by URL
- [x] Auto-parse and classify items (channel/movie/series)
- [x] Browse content by type with search, pagination, group filter
- [x] Stream playback through proxy pipeline (web + iOS)
- [x] HLS + MP4/MKV playback (hls.js on web, AVPlayer on iOS)
- [x] Device activation system (code-based binding)
- [x] Admin: customer list, detail view, role management

## P1 — Should Have
- [x] Series episode resolver (Xtream API integration)
- [x] Resume playback position (localStorage)
- [x] Multi-strategy proxy cascade with payload validation
- [x] Channel navigation (prev/next in player)
- [ ] Playlist refresh / re-scan
- [ ] Favorites / watch history (server-side)

## P2 — Nice to Have
- [ ] EPG / TV guide integration
- [ ] DVR / timeshift
- [ ] Multi-language UI
- [ ] tvOS app
- [ ] Android app
- [ ] Push notifications for playlist status changes
