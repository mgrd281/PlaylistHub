# Project Brief

## Vision
PlaylistHub is a multi-platform IPTV playlist manager that lets users import M3U/Xtream playlists, browse categorized content (live TV, movies, series), and stream reliably through a multi-hop proxy pipeline that bypasses provider IP restrictions.

## Platforms
- **Web** — Next.js 16 on Vercel (primary)
- **iOS / tvOS** — SwiftUI native app with AVPlayer (device-activation model)

## Core Value Props
1. **One-click import** — paste M3U URL or Xtream creds, auto-parse and classify content
2. **Smart classification** — URL-path + keyword + regex scoring classifies items as channel/movie/series
3. **Resilient streaming** — multi-strategy proxy cascade (Scanner→CF Worker→Direct) ensures playback even when providers block datacenter IPs
4. **Device binding** — activation-code system links iOS devices to user accounts
5. **Admin dashboard** — customer management, playlist stats, device oversight

## Target Users
- IPTV subscribers who want a clean, unified interface for their provider playlists
- Admin operators managing multiple customers

## Non-Goals
- PlaylistHub does not host or redistribute content
- No DVR / recording functionality
- No EPG / TV guide (future consideration)
