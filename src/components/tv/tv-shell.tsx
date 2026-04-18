'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpatialNav } from './use-spatial-nav';
import { PlaylistItem } from '@/types/database';
import {
  Home, Tv, Film, Clapperboard, Search, Star, Settings, Layers,
  Play, ChevronRight, ChevronLeft,
} from 'lucide-react';

/* ═══════════════════════════════════════════
   Types
   ═══════════════════════════════════════════ */

type TVPage = 'home' | 'live' | 'movies' | 'series' | 'search' | 'favorites' | 'settings';

interface ContentSection {
  name: string;
  items: PlaylistItem[];
  count: number;
}

/* ═══════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════ */

const NAV_ITEMS: { key: TVPage; label: string; icon: React.ElementType }[] = [
  { key: 'home',      label: 'Home',      icon: Home },
  { key: 'live',      label: 'Live TV',   icon: Tv },
  { key: 'movies',    label: 'Movies',    icon: Film },
  { key: 'series',    label: 'Series',    icon: Clapperboard },
  { key: 'search',    label: 'Search',    icon: Search },
  { key: 'favorites', label: 'Favorites', icon: Star },
  { key: 'settings',  label: 'Settings',  icon: Settings },
];

const DARK_TONES = [
  'from-neutral-800 to-neutral-900',
  'from-zinc-800 to-zinc-900',
  'from-stone-800 to-stone-900',
  'from-gray-800 to-gray-900',
];

function darkTone(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return DARK_TONES[Math.abs(h) % DARK_TONES.length];
}

/* ═══════════════════════════════════════════
   TV Card — Large, focus-first
   ═══════════════════════════════════════════ */

function TVCard({
  item,
  onSelect,
  variant = 'landscape',
  id,
}: {
  item: PlaylistItem;
  onSelect: () => void;
  variant?: 'landscape' | 'portrait';
  id: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const hasImage = item.tvg_logo && !error;
  const Icon = item.content_type === 'movie' ? Film : item.content_type === 'series' ? Clapperboard : Tv;

  const aspect = variant === 'portrait' ? 'aspect-[2/3]' : 'aspect-video';
  const width = variant === 'portrait' ? 'w-[180px]' : 'w-[280px]';

  return (
    <button
      id={id}
      type="button"
      data-focusable="true"
      onClick={onSelect}
      className={`group relative flex-shrink-0 rounded-xl overflow-hidden ${aspect} ${width} bg-neutral-800/60 transition-all duration-200 outline-none
        focus:ring-4 focus:ring-white/80 focus:scale-105 focus:z-20 focus:shadow-2xl focus:shadow-white/10
        hover:ring-2 hover:ring-white/30`}
    >
      {hasImage ? (
        <>
          <img
            src={item.tvg_logo!}
            alt=""
            loading="lazy"
            decoding="async"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
          {!loaded && <div className="absolute inset-0 bg-neutral-800 animate-pulse" />}
        </>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${darkTone(item.name)}`}>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.08] ring-1 ring-white/[0.06]">
              <Icon className="h-7 w-7 text-white/30" />
            </div>
            <p className="text-sm font-semibold text-white/50 text-center leading-snug line-clamp-2 max-w-[90%]">
              {item.name}
            </p>
          </div>
        </div>
      )}

      {/* Bottom gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Play indicator on focus */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-focus:opacity-100 transition-opacity duration-200">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-2xl">
          <Play className="h-6 w-6 text-black fill-black ml-0.5" />
        </div>
      </div>

      {/* Info */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-sm font-semibold text-white leading-tight line-clamp-2 drop-shadow-lg">{item.name}</p>
        {item.group_title && (
          <p className="text-xs text-white/40 truncate mt-1">{item.group_title}</p>
        )}
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════
   TV Content Rail
   ═══════════════════════════════════════════ */

function TVRail({
  title,
  items,
  onSelect,
  variant = 'landscape',
  railId,
}: {
  title: string;
  items: PlaylistItem[];
  onSelect: (item: PlaylistItem) => void;
  variant?: 'landscape' | 'portrait';
  railId: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-white/90 pl-2">{title}</h2>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-none pl-2 pr-12 pb-2"
      >
        {items.map((item, i) => (
          <TVCard
            key={item.id}
            id={`${railId}-${i}`}
            item={item}
            variant={variant}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TV Player — Fullscreen with channel nav
   ═══════════════════════════════════════════ */

function TVPlayer({
  item,
  channelList,
  onClose,
  onChannelChange,
}: {
  item: PlaylistItem;
  channelList: PlaylistItem[];
  onClose: () => void;
  onChannelChange: (item: PlaylistItem) => void;
}) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentIndex = channelList.findIndex((ch) => ch.id === item.id);

  const hideOverlayAfterDelay = useCallback(() => {
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => {
      setShowOverlay(false);
      setShowInfo(false);
    }, 4000);
  }, []);

  useEffect(() => {
    hideOverlayAfterDelay();
    return () => { if (overlayTimer.current) clearTimeout(overlayTimer.current); };
  }, [hideOverlayAfterDelay]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      e.stopPropagation();

      if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'XF86Back') {
        e.preventDefault();
        onClose();
        return;
      }

      // Show overlay on any interaction
      setShowOverlay(true);
      setShowInfo(true);
      hideOverlayAfterDelay();

      // Channel up/down
      if (e.key === 'ArrowUp' || e.key === 'ChannelUp') {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : channelList.length - 1;
        onChannelChange(channelList[prev]);
      } else if (e.key === 'ArrowDown' || e.key === 'ChannelDown') {
        e.preventDefault();
        const next = currentIndex < channelList.length - 1 ? currentIndex + 1 : 0;
        onChannelChange(channelList[next]);
      }
    }

    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, [currentIndex, channelList, onChannelChange, onClose, hideOverlayAfterDelay]);

  const streamSrc = `/api/stream?url=${encodeURIComponent(item.stream_url)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Video */}
      <video
        ref={videoRef}
        src={streamSrc}
        autoPlay
        className="absolute inset-0 h-full w-full object-contain"
      />

      {/* Info overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40 transition-opacity duration-500 ${
          showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-6 flex items-center gap-4">
          <div className="flex items-center gap-3 bg-black/50 backdrop-blur-md rounded-xl px-4 py-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-white/80">LIVE</span>
          </div>
          {currentIndex >= 0 && (
            <span className="text-sm text-white/40">
              CH {currentIndex + 1} / {channelList.length}
            </span>
          )}
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="flex items-end gap-5">
            {item.tvg_logo && (
              <div className="flex-shrink-0 h-16 w-16 rounded-xl overflow-hidden bg-white/10">
                <img src={item.tvg_logo} alt="" className="h-full w-full object-contain p-1" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{item.name}</h2>
              {item.group_title && (
                <p className="text-base text-white/40 mt-1">{item.group_title}</p>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col items-center gap-1 text-white/30">
              <ChevronLeft className="h-5 w-5 rotate-90" />
              <span className="text-xs">CH</span>
              <ChevronLeft className="h-5 w-5 -rotate-90" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Pages
   ═══════════════════════════════════════════ */

function TVHomePage({ onPlay, allChannels }: { onPlay: (item: PlaylistItem) => void; allChannels: PlaylistItem[] }) {
  const [sections, setSections] = useState<{ channels: ContentSection[]; movies: ContentSection[]; series: ContentSection[] }>({
    channels: [], movies: [], series: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [chRes, mvRes, srRes] = await Promise.all([
          fetch('/api/browse?type=channel&mode=grouped'),
          fetch('/api/browse?type=movie&limit=40'),
          fetch('/api/browse?type=series&limit=40'),
        ]);
        const chData = await chRes.json();
        const mvData = await mvRes.json();
        const srData = await srRes.json();

        setSections({
          channels: (chData.sections || []).slice(0, 5),
          movies: mvData.items ? [{ name: 'Movies', items: mvData.items, count: mvData.total }] : [],
          series: srData.items ? [{ name: 'Series', items: srData.items, count: srData.total }] : [],
        });
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          <p className="text-lg text-white/40">Loading...</p>
        </div>
      </div>
    );
  }

  const hasContent = sections.channels.length > 0 || sections.movies.length > 0 || sections.series.length > 0;

  if (!hasContent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Layers className="h-16 w-16 text-white/10 mx-auto" />
          <p className="text-xl text-white/40">No content available</p>
          <p className="text-base text-white/20">Add playlists from the web dashboard to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-4">
      {/* Featured hero */}
      {sections.channels.length > 0 && sections.channels[0].items.length > 0 && (
        <FeaturedHero item={sections.channels[0].items[0]} onPlay={onPlay} />
      )}

      {/* Channel rails */}
      {sections.channels.map((sec) => (
        <TVRail
          key={sec.name}
          railId={`home-ch-${sec.name}`}
          title={`📺 ${sec.name}`}
          items={sec.items.slice(0, 20)}
          onSelect={onPlay}
          variant="landscape"
        />
      ))}

      {/* Movies */}
      {sections.movies.length > 0 && sections.movies[0].items.length > 0 && (
        <TVRail
          railId="home-movies"
          title="🎬 Movies"
          items={sections.movies[0].items.slice(0, 20)}
          onSelect={onPlay}
          variant="portrait"
        />
      )}

      {/* Series */}
      {sections.series.length > 0 && sections.series[0].items.length > 0 && (
        <TVRail
          railId="home-series"
          title="📺 Series"
          items={sections.series[0].items.slice(0, 20)}
          onSelect={onPlay}
          variant="portrait"
        />
      )}
    </div>
  );
}

/* Featured Hero */
function FeaturedHero({ item, onPlay }: { item: PlaylistItem; onPlay: (item: PlaylistItem) => void }) {
  return (
    <div className="relative h-[340px] rounded-2xl overflow-hidden mx-2">
      {item.tvg_logo ? (
        <img src={item.tvg_logo} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${darkTone(item.name)}`} />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 p-10 space-y-4 max-w-[60%]">
        <h1 className="text-4xl font-bold text-white leading-tight">{item.name}</h1>
        {item.group_title && <p className="text-lg text-white/50">{item.group_title}</p>}
        <button
          type="button"
          data-focusable="true"
          onClick={() => onPlay(item)}
          className="flex items-center gap-3 bg-white text-black font-bold px-8 py-3 rounded-xl text-lg transition-all
            focus:ring-4 focus:ring-white/80 focus:scale-105 outline-none"
        >
          <Play className="h-5 w-5 fill-black" />
          Watch Now
        </button>
      </div>
    </div>
  );
}

/* ─── Live TV Page ─── */
function TVLivePage({ onPlay }: { onPlay: (item: PlaylistItem) => void }) {
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/browse?type=channel&mode=grouped');
        const data = await res.json();
        setSections(data.sections || []);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-10 w-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 py-4">
      <div className="pl-2">
        <h1 className="text-3xl font-bold text-white">Live TV</h1>
        <p className="text-base text-white/35 mt-1">
          {sections.reduce((s, g) => s + g.count, 0)} channels across {sections.length} groups
        </p>
      </div>
      {sections.map((sec) => (
        <TVRail
          key={sec.name}
          railId={`live-${sec.name}`}
          title={sec.name}
          items={sec.items.slice(0, 30)}
          onSelect={onPlay}
          variant="landscape"
        />
      ))}
    </div>
  );
}

/* ─── Movies / Series Page ─── */
function TVContentPage({
  contentType,
  onPlay,
}: {
  contentType: 'movie' | 'series';
  onPlay: (item: PlaylistItem) => void;
}) {
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [loading, setLoading] = useState(true);
  const label = contentType === 'movie' ? 'Movies' : 'Series';

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/browse?type=${contentType}&mode=grouped`);
        const data = await res.json();
        setSections(data.sections || []);
      } catch {}
      setLoading(false);
    }
    load();
  }, [contentType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-10 w-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 py-4">
      <div className="pl-2">
        <h1 className="text-3xl font-bold text-white">{label}</h1>
        <p className="text-base text-white/35 mt-1">
          {sections.reduce((s, g) => s + g.count, 0)} titles
        </p>
      </div>
      {sections.map((sec) => (
        <TVRail
          key={sec.name}
          railId={`${contentType}-${sec.name}`}
          title={sec.name}
          items={sec.items.slice(0, 30)}
          onSelect={onPlay}
          variant="portrait"
        />
      ))}
    </div>
  );
}

/* ─── Search Page ─── */
function TVSearchPage({ onPlay }: { onPlay: (item: PlaylistItem) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/browse?type=channel&search=${encodeURIComponent(query)}&limit=100`);
        const data = await res.json();
        setResults(data.items || []);
      } catch {}
      setLoading(false);
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return (
    <div className="space-y-6 py-4">
      <div className="pl-2">
        <h1 className="text-3xl font-bold text-white">Search</h1>
      </div>
      <div className="px-2">
        <input
          data-focusable="true"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search channels, movies, series..."
          className="w-full max-w-2xl bg-white/[0.06] border border-white/[0.1] rounded-xl px-6 py-4 text-xl text-white placeholder:text-white/25 outline-none
            focus:ring-4 focus:ring-white/80 focus:bg-white/[0.1]"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-2">
          {results.map((item, i) => (
            <TVCard
              key={item.id}
              id={`search-${i}`}
              item={item}
              variant="landscape"
              onSelect={() => onPlay(item)}
            />
          ))}
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-white/10 mx-auto mb-4" />
          <p className="text-lg text-white/30">No results for &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

/* ─── Favorites Page ─── */
function TVFavoritesPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-4">
        <Star className="h-16 w-16 text-white/10 mx-auto" />
        <p className="text-xl text-white/40">Favorites</p>
        <p className="text-base text-white/20">Coming soon — mark channels as favorites for quick access</p>
      </div>
    </div>
  );
}

/* ─── Settings Page ─── */
function TVSettingsPage() {
  return (
    <div className="space-y-8 py-4 px-2">
      <h1 className="text-3xl font-bold text-white">Settings</h1>
      <div className="space-y-2 max-w-xl">
        {[
          { label: 'Account', desc: 'Manage your account on the web dashboard' },
          { label: 'Playlists', desc: 'Add or remove playlists from the web dashboard' },
          { label: 'Playback', desc: 'Video quality and buffer settings' },
          { label: 'About', desc: 'PlaylistHub TV v1.0' },
        ].map((item, i) => (
          <button
            key={item.label}
            data-focusable="true"
            type="button"
            className="w-full flex items-center justify-between bg-white/[0.04] hover:bg-white/[0.06] rounded-xl px-6 py-5 transition-all outline-none
              focus:ring-4 focus:ring-white/80 focus:bg-white/[0.08]"
          >
            <div className="text-left">
              <p className="text-lg font-medium text-white">{item.label}</p>
              <p className="text-sm text-white/35 mt-0.5">{item.desc}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/20" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Main TV Shell
   ═══════════════════════════════════════════ */

export function TVShell() {
  const [activePage, setActivePage] = useState<TVPage>('home');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [playerItem, setPlayerItem] = useState<PlaylistItem | null>(null);
  const [allChannels, setAllChannels] = useState<PlaylistItem[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load all channels for player prev/next
  useEffect(() => {
    async function loadChannels() {
      try {
        const res = await fetch('/api/browse?type=channel&mode=grouped');
        const data = await res.json();
        const all = (data.sections || []).flatMap((s: ContentSection) => s.items);
        setAllChannels(all);
      } catch {}
    }
    loadChannels();
  }, []);

  const handlePlay = useCallback((item: PlaylistItem) => {
    setPlayerItem(item);
  }, []);

  const handleChannelChange = useCallback((item: PlaylistItem) => {
    setPlayerItem(item);
  }, []);

  const { focusFirst } = useSpatialNav({
    active: !playerItem,
    onBack: () => {
      if (activePage !== 'home') {
        setActivePage('home');
      }
    },
  });

  // Focus first element when page changes
  useEffect(() => {
    if (!playerItem) {
      const timer = setTimeout(focusFirst, 100);
      return () => clearTimeout(timer);
    }
  }, [activePage, playerItem, focusFirst]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ── */}
      <div
        className={`flex-shrink-0 flex flex-col bg-black/60 backdrop-blur-xl border-r border-white/[0.04] transition-all duration-300 z-30 ${
          sidebarExpanded ? 'w-[220px]' : 'w-[72px]'
        }`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        {/* Logo */}
        <div className="flex items-center h-20 px-4 gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.08]">
            <Tv className="h-5 w-5 text-white" />
          </div>
          {sidebarExpanded && (
            <span className="text-lg font-bold text-white whitespace-nowrap">PlaylistHub</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-1 px-2 py-2">
          {NAV_ITEMS.map((nav) => (
            <button
              key={nav.key}
              type="button"
              data-focusable="true"
              onClick={() => { setActivePage(nav.key); setSidebarExpanded(false); }}
              className={`flex items-center gap-3 rounded-xl px-3 py-3.5 transition-all duration-150 outline-none
                focus:ring-4 focus:ring-white/80 focus:bg-white/[0.12]
                ${activePage === nav.key
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/40 hover:bg-white/[0.06] hover:text-white/70'
                }`}
            >
              <nav.icon className="h-5 w-5 flex-shrink-0" />
              {sidebarExpanded && (
                <span className="text-[15px] font-medium whitespace-nowrap">{nav.label}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Content ── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 lg:px-8">
        {activePage === 'home' && <TVHomePage onPlay={handlePlay} allChannels={allChannels} />}
        {activePage === 'live' && <TVLivePage onPlay={handlePlay} />}
        {activePage === 'movies' && <TVContentPage contentType="movie" onPlay={handlePlay} />}
        {activePage === 'series' && <TVContentPage contentType="series" onPlay={handlePlay} />}
        {activePage === 'search' && <TVSearchPage onPlay={handlePlay} />}
        {activePage === 'favorites' && <TVFavoritesPage />}
        {activePage === 'settings' && <TVSettingsPage />}
      </div>

      {/* ── Player Overlay ── */}
      {playerItem && (
        <TVPlayer
          item={playerItem}
          channelList={allChannels}
          onClose={() => setPlayerItem(null)}
          onChannelChange={handleChannelChange}
        />
      )}
    </div>
  );
}
