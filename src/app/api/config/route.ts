import { NextResponse } from "next/server";

/**
 * GET /api/config
 *
 * Server-driven configuration for the iOS app.
 * Changes here take effect in the app within 5 minutes (next refresh cycle)
 * without requiring a new App Store build.
 *
 * Compliant with Apple App Store Guidelines §3.3.2:
 * - This is data/content configuration, not executable code
 * - The app's native rendering logic is compiled into the binary
 * - This only controls what content to show and how to present it
 */
export async function GET() {
  const config = {
    version: 1,

    // ── App Identity ──
    appName: "PlaylistHub",
    tagline: "Your playlists, everywhere",
    attribution: "Ein Unternehmen der karinex.de",

    // ── Splash ──
    splash: {
      logoIcon: "play.rectangle.fill",
      durationSeconds: 1.2,
      animationEnabled: true,
    },

    // ── Tabs ──
    tabs: [
      { id: "home", label: "Home", icon: "house.fill", enabled: true, order: 0 },
      { id: "liveTV", label: "Live TV", icon: "tv.fill", enabled: true, order: 1 },
      { id: "movies", label: "Movies", icon: "film.fill", enabled: true, order: 2 },
      { id: "series", label: "Series", icon: "rectangle.stack.fill", enabled: true, order: 3 },
      { id: "settings", label: "Settings", icon: "gearshape.fill", enabled: true, order: 4 },
    ],

    // ── Home Sections (order + visibility) ──
    homeSections: [
      { id: "hero", enabled: true, order: 0 },
      { id: "quickActions", enabled: true, order: 1 },
      { id: "stats", enabled: true, order: 2 },
      { id: "continueWatching", enabled: true, order: 3, title: "Continue Watching", icon: "clock.fill" },
      { id: "featuredMovies", enabled: true, order: 4, title: "Featured Movies", icon: "film.fill", maxItems: 15 },
      { id: "featuredSeries", enabled: true, order: 5, title: "Popular Series", icon: "rectangle.stack.fill", maxItems: 15 },
      { id: "playlists", enabled: true, order: 6, title: "Your Playlists" },
    ],

    // ── Quick Actions ──
    quickActions: [
      { id: "liveTV", icon: "tv.fill", title: "Live TV", gradientColors: ["#3399FF", "#33CCCC"], enabled: true, order: 0, destination: "liveTV" },
      { id: "movies", icon: "film.fill", title: "Movies", gradientColors: ["#9933CC", "#FF66AA"], enabled: true, order: 1, destination: "movies" },
      { id: "series", icon: "rectangle.stack.fill", title: "Series", gradientColors: ["#FF9933", "#FF3333"], enabled: true, order: 2, destination: "series" },
      { id: "add", icon: "plus.circle.fill", title: "Add", subtitle: "New playlist", gradientColors: [], enabled: true, order: 3, destination: "addPlaylist" },
    ],

    // ── Strings ──
    strings: {
      greetingMorning: "Good morning",
      greetingAfternoon: "Good afternoon",
      greetingEvening: "Good evening",
      greetingNight: "Good night",
      liveBadge: "LIVE",
      retryButton: "Retry",
      cancelButton: "Cancel",
      deleteButton: "Delete",
      searchPlaceholder: "Search...",
      emptyPlaylists: "No playlists yet",
      emptyPlaylistsSubtitle: "Add your first M3U or Xtream playlist to get started.",
      emptyChannels: "No channels available",
      emptyMovies: "No movies found",
      emptySeries: "No series found",
      settingsTitle: "Settings",
      signOutTitle: "Sign Out?",
      signOutMessage: "You'll need to sign in again to access your playlists.",
    },

    // ── Player ──
    player: {
      controlsAutoHideSeconds: 4,
      channelFlashSeconds: 1.2,
      seekBackwardSeconds: 10,
      seekForwardSeconds: 10,
      watchProgressSaveInterval: 5,
      relatedChannelsMax: 40,
      swipeThreshold: 50,
    },

    // ── Content ──
    content: {
      featuredMoviesLimit: 15,
      featuredSeriesLimit: 15,
      recentPlaylistsLimit: 3,
      paginationLimit: 50,
      searchDebounceMs: 400,
      watchHistoryMax: 50,
      watchMinPosition: 5,
      watchCompletionThreshold: 0.95,
      watchResumeMinPosition: 10,
    },

    // ── Live TV Categories (null = use compiled-in classifier) ──
    // Uncomment and customize to override the built-in category system:
    // liveCategories: [
    //   { id: "sports", label: "Sports", emoji: "⚽", patterns: ["sport|football|soccer|nfl|nba|boxing|ufc|tennis|cricket|rugby|f1|racing|baseball|hockey|golf|olympic"], order: 0, enabled: true },
    //   { id: "news", label: "News", emoji: "📰", patterns: ["news|cnn|bbc|fox|msnbc|cnbc|sky\\s*news|al\\s*jazeera|euronews|france24"], order: 1, enabled: true },
    //   ...
    // ],

    // ── Stream ──
    stream: {
      sourceTimeoutSeconds: 6,
      userAgent: "VLC/3.0.21 LibVLC/3.0.21",
      forwardBufferSeconds: 2,
      cascadeOrder: ["direct", "cf", "vercel"],
    },

    // ── Cache ──
    cache: {
      playlistTTLSeconds: 300,
      channelCacheTTLSeconds: 600,
      imageCacheCountLimit: 600,
      imageCacheSizeMB: 80,
      imageMaxDimension: 300,
      heartbeatIntervalSeconds: 300,
    },

    // ── Feature Flags ──
    features: {
      pipEnabled: true,
      brightnessGestureEnabled: true,
      volumeGestureEnabled: true,
      continueWatchingEnabled: true,
      featuredContentEnabled: true,
      quickActionsEnabled: true,
      statsRibbonEnabled: true,
      proBadgeEnabled: true,
    },

    // ── Layout ──
    layout: {
      posterCardHeight: 165,
      gridColumns: 3,
      gridSpacing: 10,
      cornerRadius: 14,
      quickActionCardWidth: 110,
      quickActionCardHeight: 100,
      continueWatchingCardWidth: 260,
      continueWatchingCardHeight: 146,
      avatarSize: 48,
      heroGradientHeight: 180,
      channelLogoSize: 38,
      railPosterWidth: 115,
    },
  };

  return NextResponse.json(config, {
    headers: {
      // Cache for 60s at CDN, stale-while-revalidate for 5 min
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
