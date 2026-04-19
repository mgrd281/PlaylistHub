'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlaylistItem } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoPlayerDialog } from '@/components/playlists/video-player-dialog';
import {
  Play, Search, Tv, Film, Clapperboard, Layers, ChevronLeft,
  ChevronRight, X, LayoutGrid, List,
} from 'lucide-react';

/* ─── Module-level cache (survives route changes) ─── */

interface CachedPage {
  items: PlaylistItem[];
  total: number;
  totalPages: number;
  ts: number;
}

interface CachedGroups {
  groups: GroupInfo[];
  ts: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const pageCache = new Map<string, CachedPage>();
const groupCache = new Map<string, CachedGroups>();

function pageCacheKey(type: string, page: number, limit: number, search: string, group: string) {
  return `${type}|${page}|${limit}|${search}|${group}`;
}

/* Module-level UI state (survives route changes) */
const uiStateCache = new Map<string, { group: string; page: number; layout: 'poster' | 'wide' }>();

const TYPE_ICON: Record<string, React.ElementType> = {
  channel: Tv,
  movie: Film,
  series: Clapperboard,
};

const TYPE_LABEL: Record<string, string> = {
  channel: 'Live TV',
  movie: 'Movies',
  series: 'Series',
};

const DARK_TONES = [
  'from-neutral-800 to-neutral-900',
  'from-zinc-800 to-zinc-900',
  'from-stone-800 to-stone-900',
  'from-gray-800 to-gray-900',
  'from-neutral-700 to-neutral-900',
  'from-zinc-700 to-zinc-900',
];

function darkTone(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return DARK_TONES[Math.abs(h) % DARK_TONES.length];
}

interface GroupInfo {
  name: string;
  count: number;
}

/* ─── Browse Card ─── */

function BrowseCard({
  item,
  onPlay,
  layout,
}: {
  item: PlaylistItem;
  onPlay: () => void;
  layout: 'poster' | 'wide';
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const Icon = TYPE_ICON[item.content_type] || Layers;
  const hasImage = item.tvg_logo && !error;

  const initials = item.name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

  if (layout === 'wide') {
    return (
      <button
        type="button"
        onClick={onPlay}
        className="group relative rounded-lg overflow-hidden aspect-video bg-neutral-800 transition-all duration-150 hover:ring-1 hover:ring-foreground/15"
      >
        {hasImage ? (
          <>
            <img
              src={item.tvg_logo!} alt="" loading="lazy" decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)} onError={() => setError(true)}
            />
            {!loaded && <div className="absolute inset-0 bg-neutral-800 animate-pulse" />}
          </>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${darkTone(item.name)}`}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.04),transparent_70%)]" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.08] ring-1 ring-white/[0.06]">
                <Icon className="h-5 w-5 text-white/30" />
              </div>
              <p className="text-[11px] font-semibold text-white/60 text-center leading-tight line-clamp-2 max-w-[85%]">{item.name}</p>
              {item.group_title && (
                <span className="text-[9px] text-white/25 truncate max-w-[80%]">{item.group_title}</span>
              )}
            </div>
          </div>
        )}

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Hover play */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
            <Play className="h-4 w-4 text-black fill-black ml-0.5" />
          </div>
        </div>

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <div className="flex items-center gap-1 rounded bg-black/50 backdrop-blur-sm px-1.5 py-0.5">
            <Icon className="h-2.5 w-2.5 text-white/50" />
            <span className="text-[9px] text-white/50 font-medium capitalize">{item.content_type}</span>
          </div>
        </div>

        {/* Bottom info — always visible */}
        {hasImage && (
          <div className="absolute bottom-0 left-0 right-0 p-2.5">
            <p className="text-[11px] font-semibold text-white leading-tight line-clamp-2 drop-shadow-lg">{item.name}</p>
            {item.group_title && <p className="text-[9px] text-white/35 truncate mt-0.5">{item.group_title}</p>}
          </div>
        )}
      </button>
    );
  }

  // Poster layout
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group relative rounded-lg overflow-hidden aspect-[2/3] bg-neutral-800 transition-all duration-150 hover:ring-1 hover:ring-foreground/15"
    >
      {hasImage ? (
        <>
          <img
            src={item.tvg_logo!} alt="" loading="lazy" decoding="async"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)} onError={() => setError(true)}
          />
          {!loaded && <div className="absolute inset-0 bg-neutral-800 animate-pulse" />}
        </>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${darkTone(item.name)}`}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.04),transparent_70%)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.08] ring-1 ring-white/[0.06]">
              <Icon className="h-5 w-5 text-white/30" />
            </div>
            <span className="text-[10px] font-bold text-white/40 tracking-wide">{initials}</span>
          </div>
        </div>
      )}

      {/* Bottom gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

      {/* Hover play */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
          <Play className="h-4 w-4 text-black fill-black ml-0.5" />
        </div>
      </div>

      {/* Bottom info — always visible */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-[10px] font-semibold text-white leading-tight line-clamp-2 drop-shadow-lg">{item.name}</p>
        {item.group_title && <p className="text-[9px] text-white/30 truncate mt-0.5">{item.group_title}</p>}
      </div>
    </button>
  );
}

/* ─── Main Export ─── */

export function ContentBrowser({ contentType }: { contentType: 'channel' | 'movie' | 'series' }) {
  const savedUi = uiStateCache.get(contentType);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState(savedUi?.group ?? '');
  const [page, setPage] = useState(savedUi?.page ?? 1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [playerItem, setPlayerItem] = useState<PlaylistItem | null>(null);
  const [layout, setLayout] = useState<'poster' | 'wide'>(savedUi?.layout ?? (contentType === 'channel' ? 'wide' : 'poster'));
  const groupScrollRef = useRef<HTMLDivElement>(null);
  const limit = 60;

  const Icon = TYPE_ICON[contentType] || Layers;
  const label = TYPE_LABEL[contentType] || contentType;

  // Persist UI state for restoration on route return
  useEffect(() => {
    uiStateCache.set(contentType, { group: activeGroup, page, layout });
  }, [contentType, activeGroup, page, layout]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeGroup]);

  // Fetch groups (with cache)
  useEffect(() => {
    const cached = groupCache.get(contentType);
    if (cached) {
      setGroups(cached.groups);
      if (Date.now() - cached.ts < CACHE_TTL) return;
    }
    async function fetchGroups() {
      try {
        const res = await fetch(`/api/browse?type=${contentType}&mode=groups`);
        if (!res.ok) return;
        const data = await res.json();
        const g: GroupInfo[] = data.groups || [];
        setGroups(g);
        groupCache.set(contentType, { groups: g, ts: Date.now() });
      } catch { /* keep cached groups */ }
    }
    fetchGroups();
  }, [contentType]);

  // Fetch items (stale-while-revalidate)
  useEffect(() => {
    let cancelled = false;
    const key = pageCacheKey(contentType, page, limit, debouncedSearch, activeGroup);
    const cached = pageCache.get(key);

    // Show cached data immediately
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setTotalPages(cached.totalPages);
      setLoading(false);
      // If fresh enough, skip network
      if (Date.now() - cached.ts < CACHE_TTL) return;
    } else {
      setLoading(true);
    }

    async function fetchItems() {
      const params = new URLSearchParams({
        type: contentType,
        page: page.toString(),
        limit: limit.toString(),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (activeGroup) params.set('group', activeGroup);

      try {
        const res = await fetch(`/api/browse?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            const newItems = data.items || [];
            const newTotal = data.total || 0;
            const newTotalPages = data.totalPages || 0;
            setItems(newItems);
            setTotal(newTotal);
            setTotalPages(newTotalPages);
            pageCache.set(key, { items: newItems, total: newTotal, totalPages: newTotalPages, ts: Date.now() });
          }
        }
      } catch { /* network error — keep showing cached data if available */ }
      if (!cancelled) setLoading(false);
    }
    fetchItems();
    return () => { cancelled = true; };
  }, [contentType, page, limit, debouncedSearch, activeGroup]);

  const gridCols = layout === 'wide'
    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
    : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7';

  const SUBTITLE: Record<string, string> = {
    channel: 'Browse and watch live television channels',
    movie: 'Browse and stream your movie collection',
    series: 'Browse and watch your TV series library',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/[0.06]">
            <Icon className="h-4.5 w-4.5 text-foreground/60" />
          </div>
          <div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{label}</h1>
              {total > 0 && !loading && (
                <span className="text-sm font-medium text-muted-foreground">{total.toLocaleString()} items</span>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">{SUBTITLE[contentType]}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-foreground/[0.05] border-foreground/[0.08] text-foreground placeholder:text-muted-foreground h-9 focus:bg-foreground/[0.07] focus:border-foreground/[0.15]"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground/70">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-foreground/[0.04] p-0.5">
          <button
            type="button"
            onClick={() => setLayout('poster')}
            className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${layout === 'poster' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/55'}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setLayout('wide')}
            className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${layout === 'wide' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/55'}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Group pills */}
      {groups.length > 1 && (
        <div ref={groupScrollRef} className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          <button
            type="button"
            onClick={() => setActiveGroup('')}
            className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
              !activeGroup ? 'bg-foreground/[0.12] text-foreground' : 'bg-foreground/[0.04] text-foreground/45 hover:bg-foreground/[0.07] hover:text-foreground/65'
            }`}
          >
            All
          </button>
          {groups.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => setActiveGroup(g.name)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                activeGroup === g.name ? 'bg-foreground/[0.12] text-foreground' : 'bg-foreground/[0.04] text-foreground/45 hover:bg-foreground/[0.07] hover:text-foreground/65'
              }`}
            >
              {g.name}
              <span className="ml-1.5 text-foreground/25">{g.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={`grid ${gridCols} gap-2`}>
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`${layout === 'wide' ? 'aspect-video' : 'aspect-[2/3]'} rounded-lg bg-foreground/[0.06]`}
            />
          ))}
        </div>
      )}

      {/* Content grid */}
      {!loading && items.length > 0 && (
        <div className={`grid ${gridCols} gap-2`}>
          {items.map((item) => (
            <BrowseCard key={item.id} item={item} layout={layout} onPlay={() => setPlayerItem(item)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] mb-4">
            <Icon className="h-6 w-6 text-white/25" />
          </div>
          <p className="text-sm text-white/50 font-medium">
            {debouncedSearch || activeGroup
              ? 'No results found. Try a different search or filter.'
              : `No ${label.toLowerCase()} available. Add a playlist to get started.`}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="h-8 w-8 rounded flex items-center justify-center text-white/40 hover:text-white/70 disabled:opacity-20 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-white/30">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-8 w-8 rounded flex items-center justify-center text-white/40 hover:text-white/70 disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Player */}
      {playerItem && (
        <VideoPlayerDialog
          item={playerItem}
          relatedItems={items}
          onClose={() => setPlayerItem(null)}
          onNavigate={(next) => setPlayerItem(next)}
        />
      )}
    </div>
  );
}
