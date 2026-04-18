'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Playlist, PlaylistItem } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoPlayerDialog } from '@/components/playlists/video-player-dialog';
import { useRouter } from 'next/navigation';
import {
  Play, Tv, Film, Clapperboard, ChevronLeft, ChevronRight,
  ArrowRight, Plus, Layers, Library, LayoutGrid,
} from 'lucide-react';

/* ════════════════════════════════════════════════════
   Monochromatic dark fallback — no rainbow gradients
   ════════════════════════════════════════════════════ */

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

const TYPE_ICON: Record<string, React.ElementType> = {
  channel: Tv,
  movie: Film,
  series: Clapperboard,
};

function shuffleSeed<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.abs((seed * (i + 1) * 2654435761) | 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ════════════════════════════════════════════════════
   Hero — Clean, cinematic, single featured item
   ════════════════════════════════════════════════════ */

function HeroSection({
  items,
  playlists,
  onPlay,
}: {
  items: PlaylistItem[];
  playlists: Playlist[];
  onPlay: (item: PlaylistItem) => void;
}) {
  const heroItems = useMemo(() => {
    const withArt = items.filter((i) => i.tvg_logo);
    if (withArt.length === 0) return [];
    return shuffleSeed(withArt, new Date().getDate()).slice(0, 5);
  }, [items]);

  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const router = useRouter();

  useEffect(() => {
    if (heroItems.length <= 1) return;
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % heroItems.length), 8000);
    return () => clearInterval(timerRef.current);
  }, [heroItems.length]);

  function goTo(i: number) {
    setIdx(i);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIdx((prev) => (prev + 1) % heroItems.length), 8000);
  }

  // Empty state
  if (heroItems.length === 0 && playlists.length === 0) {
    return (
      <div className="relative rounded-xl overflow-hidden h-[300px] sm:h-[380px] bg-neutral-900">
        <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-8">
          <div className="h-14 w-14 rounded-xl bg-white/[0.06] flex items-center justify-center mb-5">
            <Play className="h-6 w-6 text-white/40 fill-white/40 ml-0.5" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight">
            Your streaming library awaits
          </h1>
          <p className="text-sm text-white/30 mt-2 max-w-sm">
            Add your first playlist to start browsing channels, movies, and series.
          </p>
          <Button
            size="lg"
            className="mt-6 rounded-md px-6 gap-2 bg-white text-black hover:bg-white/90 font-semibold"
            onClick={() => router.push('/playlists')}
          >
            <Plus className="h-4 w-4" />
            Add Playlist
          </Button>
        </div>
      </div>
    );
  }

  // No items with art
  if (heroItems.length === 0) {
    const total = playlists.reduce((s, p) => s + p.channels_count + p.movies_count + p.series_count, 0);
    return (
      <div className="relative rounded-xl overflow-hidden h-[260px] sm:h-[320px] bg-neutral-900">
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Your Media Library</h1>
          <p className="text-sm text-white/30 mt-1">
            {playlists.length} playlist{playlists.length !== 1 ? 's' : ''} · {total.toLocaleString()} items
          </p>
          <Button size="lg" className="mt-5 w-fit rounded-md px-6 gap-2 bg-white text-black hover:bg-white/90 font-semibold" onClick={() => router.push('/playlists')}>
            <Library className="h-4 w-4" />
            Browse
          </Button>
        </div>
      </div>
    );
  }

  const featured = heroItems[idx];

  return (
    <div className="relative rounded-xl overflow-hidden h-[300px] sm:h-[400px]">
      {heroItems.map((item, i) => (
        <div key={item.id} className={`absolute inset-0 transition-opacity duration-1000 ${i === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {item.tvg_logo ? (
            <>
              <img
                src={item.tvg_logo} alt="" loading={i < 2 ? 'eager' : 'lazy'}
                className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[10000ms] ease-linear ${i === idx ? 'scale-[1.03]' : 'scale-100'}`}
                onLoad={() => setLoaded((s) => ({ ...s, [i]: true }))}
              />
              {!loaded[i] && <div className="absolute inset-0 bg-neutral-900 animate-pulse" />}
            </>
          ) : (
            <div className="absolute inset-0 bg-neutral-900" />
          )}
        </div>
      ))}

      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40" />

      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
          {featured.content_type === 'channel' ? 'Live Now' : featured.content_type === 'movie' ? 'Featured Film' : 'Featured Series'}
        </span>
        <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight line-clamp-2 max-w-lg">
          {featured.name}
        </h1>
        {featured.group_title && (
          <p className="text-xs text-white/25 mt-1">{featured.group_title}</p>
        )}
        <div className="flex items-center gap-2.5 mt-4">
          <Button
            size="default"
            className="rounded-md px-5 gap-2 bg-white text-black hover:bg-white/90 font-semibold text-sm h-9"
            onClick={() => onPlay(featured)}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Play
          </Button>
          <Button
            variant="outline"
            size="default"
            className="rounded-md px-5 gap-2 border-white/15 text-white/70 hover:bg-white/[0.06] hover:text-white text-sm h-9"
            onClick={() => {
              const pl = playlists.find((p) => p.id === featured.playlist_id);
              if (pl) router.push(`/playlists/${pl.id}`);
            }}
          >
            More Info
          </Button>
        </div>

        {heroItems.length > 1 && (
          <div className="flex items-center gap-1.5 mt-5">
            {heroItems.map((_, i) => (
              <button
                key={i} type="button" onClick={() => goTo(i)}
                className={`rounded-full transition-all duration-300 ${i === idx ? 'w-6 h-1 bg-white' : 'w-1 h-1 bg-white/20 hover:bg-white/40'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Quick Stats — Minimal inline row
   ════════════════════════════════════════════════════ */

function QuickStats({ playlists }: { playlists: Playlist[] }) {
  const router = useRouter();
  const ch = playlists.reduce((s, p) => s + p.channels_count, 0);
  const mv = playlists.reduce((s, p) => s + p.movies_count, 0);
  const sr = playlists.reduce((s, p) => s + p.series_count, 0);

  if (ch + mv + sr === 0) return null;

  const TYPE_ROUTES: Record<string, string> = { channel: '/live-tv', movie: '/movies', series: '/series' };

  const items = [
    { label: 'Channels', count: ch, icon: Tv, type: 'channel' },
    { label: 'Movies', count: mv, icon: Film, type: 'movie' },
    { label: 'Series', count: sr, icon: Clapperboard, type: 'series' },
  ].filter((i) => i.count > 0);

  return (
    <div className="flex items-center gap-2">
      {items.map((item) => (
        <button
          key={item.type}
          type="button"
          onClick={() => router.push(TYPE_ROUTES[item.type] || '/playlists')}
          className="group flex items-center gap-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] px-4 py-2.5 transition-colors duration-150"
        >
          <item.icon className="h-4 w-4 text-white/30" />
          <span className="text-sm font-bold text-white/80">{item.count.toLocaleString()}</span>
          <span className="text-xs text-white/30">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Content Card — Dark, clean poster & wide
   ════════════════════════════════════════════════════ */

function ContentCard({
  item,
  onSelect,
  size = 'normal',
  rank,
}: {
  item: PlaylistItem;
  onSelect: () => void;
  size?: 'normal' | 'wide';
  rank?: number;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const Icon = TYPE_ICON[item.content_type] || Layers;

  if (size === 'wide') {
    return (
      <button
        type="button" onClick={onSelect}
        className="group relative flex-shrink-0 rounded-lg overflow-hidden aspect-video min-w-[220px] max-w-[220px] sm:min-w-[270px] sm:max-w-[270px] transition-all duration-200 hover:ring-1 hover:ring-white/10 hover:z-10"
      >
        {item.tvg_logo && !imgError ? (
          <>
            <img src={item.tvg_logo} alt="" loading="lazy" decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} />
            {!imgLoaded && <div className="absolute inset-0 bg-neutral-800 animate-pulse" />}
          </>
        ) : (
          <div className="absolute inset-0 bg-neutral-800">
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon className="h-8 w-8 text-white/[0.06]" />
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-4 w-4 text-black fill-black ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">{item.name}</p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button" onClick={onSelect}
      className="group relative flex-shrink-0 rounded-lg overflow-hidden aspect-[2/3] min-w-[115px] max-w-[115px] sm:min-w-[140px] sm:max-w-[140px] transition-all duration-200 hover:ring-1 hover:ring-white/10 hover:z-10"
    >
      {item.tvg_logo && !imgError ? (
        <>
          <img src={item.tvg_logo} alt="" loading="lazy" decoding="async"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} />
          {!imgLoaded && <div className="absolute inset-0 bg-neutral-800 animate-pulse" />}
        </>
      ) : (
        <div className="absolute inset-0 bg-neutral-800">
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="h-7 w-7 text-white/[0.06]" />
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg">
          <Play className="h-4 w-4 text-black fill-black ml-0.5" />
        </div>
      </div>
      {rank != null && (
        <span className="absolute top-0 left-1 text-[36px] font-black text-white/[0.06] leading-none">{rank}</span>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-[10px] font-medium text-white/80 leading-tight line-clamp-2">{item.name}</p>
        {item.group_title && <p className="text-[9px] text-white/20 truncate mt-0.5">{item.group_title}</p>}
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════
   Content Rail — Horizontal scroll
   ════════════════════════════════════════════════════ */

function ContentRail({
  title,
  icon: RailIcon,
  items,
  onSelectItem,
  onViewAll,
  size = 'normal',
  showRank,
}: {
  title: string;
  icon?: React.ElementType;
  items: PlaylistItem[];
  onSelectItem: (item: PlaylistItem) => void;
  onViewAll?: () => void;
  size?: 'normal' | 'wide';
  showRank?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 10);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScroll();
    el.addEventListener('scroll', updateScroll, { passive: true });
    const ro = new ResizeObserver(updateScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScroll); ro.disconnect(); };
  }, [updateScroll, items]);

  function scroll(dir: 'left' | 'right') {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -scrollRef.current.clientWidth * 0.75 : scrollRef.current!.clientWidth * 0.75, behavior: 'smooth' });
  }

  if (items.length === 0) return null;

  return (
    <div className="group/rail space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2">
          {RailIcon && <RailIcon className="h-3.5 w-3.5 text-white/25" />}
          {title}
        </h3>
        <div className="flex items-center gap-1">
          {onViewAll && (
            <button type="button" onClick={onViewAll} className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1">
              View All <ArrowRight className="h-3 w-3" />
            </button>
          )}
          <div className="flex gap-0.5 opacity-0 group-hover/rail:opacity-100 transition-opacity ml-1">
            <button type="button" onClick={() => scroll('left')} disabled={!canLeft} className="h-6 w-6 rounded flex items-center justify-center text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => scroll('right')} disabled={!canRight} className="h-6 w-6 rounded flex items-center justify-center text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-2 overflow-x-auto scrollbar-none scroll-smooth pb-1">
        {items.map((item, i) => (
          <ContentCard key={item.id} item={item} size={size} rank={showRank ? i + 1 : undefined} onSelect={() => onSelectItem(item)} />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Playlist Showcase — Muted dark cards
   ════════════════════════════════════════════════════ */

function PlaylistShowcase({ playlists }: { playlists: Playlist[] }) {
  const router = useRouter();
  if (playlists.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2">
          <Library className="h-3.5 w-3.5 text-white/25" />
          Your Libraries
        </h3>
        <button type="button" onClick={() => router.push('/playlists')} className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1">
          Manage <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {playlists.slice(0, 6).map((pl) => {
          const total = pl.channels_count + pl.movies_count + pl.series_count;
          return (
            <button
              key={pl.id}
              onClick={() => router.push(`/playlists/${pl.id}`)}
              className="group rounded-lg bg-white/[0.03] hover:bg-white/[0.06] p-4 text-left transition-colors duration-150"
            >
              <p className="text-sm font-semibold text-white/80 line-clamp-1">{pl.name}</p>
              <div className="flex items-center gap-3 mt-2 text-white/25 text-[11px]">
                <span>{total.toLocaleString()} items</span>
                {pl.channels_count > 0 && <span className="flex items-center gap-1"><Tv className="h-3 w-3" />{pl.channels_count}</span>}
                {pl.movies_count > 0 && <span className="flex items-center gap-1"><Film className="h-3 w-3" />{pl.movies_count}</span>}
                {pl.series_count > 0 && <span className="flex items-center gap-1"><Clapperboard className="h-3 w-3" />{pl.series_count}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Category Grid — Dark, flat tiles
   ════════════════════════════════════════════════════ */

function CategoryGrid({ items, onSelectItem }: { items: PlaylistItem[]; onSelectItem: (item: PlaylistItem) => void }) {
  const categories = useMemo(() => {
    const groups = new Map<string, { items: PlaylistItem[]; sample: PlaylistItem }>();
    for (const item of items) {
      const g = item.group_title || 'Other';
      if (!groups.has(g)) groups.set(g, { items: [], sample: item });
      groups.get(g)!.items.push(item);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1].items.length - a[1].items.length)
      .slice(0, 8);
  }, [items]);

  if (categories.length < 3) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2">
        <LayoutGrid className="h-3.5 w-3.5 text-white/25" />
        Categories
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {categories.map(([name, { items: catItems, sample }]) => (
          <button
            key={name} type="button" onClick={() => onSelectItem(catItems[0])}
            className="group relative rounded-md overflow-hidden h-[60px] transition-all duration-150 hover:ring-1 hover:ring-white/10"
          >
            {sample.tvg_logo ? (
              <img src={sample.tvg_logo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-neutral-800" />
            )}
            <div className="absolute inset-0 bg-black/65 group-hover:bg-black/55 transition-colors" />
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[11px] font-semibold text-white/80">{name}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Main Media Home
   ════════════════════════════════════════════════════ */

export function MediaHome({ playlists }: { playlists: Playlist[] }) {
  const router = useRouter();
  const [contentItems, setContentItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerItem, setPlayerItem] = useState<PlaylistItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchContent() {
      if (playlists.length === 0) { setLoading(false); return; }
      setLoading(true);
      const allItems: PlaylistItem[] = [];
      const fetches = playlists.slice(0, 5).map(async (pl) => {
        try {
          const res = await fetch(`/api/playlists/${pl.id}/items?limit=200`);
          if (!res.ok) return [];
          const data = await res.json();
          return (data.items || []) as PlaylistItem[];
        } catch { return []; }
      });
      const results = await Promise.all(fetches);
      for (const items of results) allItems.push(...items);
      if (!cancelled) { setContentItems(allItems); setLoading(false); }
    }
    fetchContent();
    return () => { cancelled = true; };
  }, [playlists]);

  const channels = useMemo(() => contentItems.filter((i) => i.content_type === 'channel'), [contentItems]);
  const movies = useMemo(() => contentItems.filter((i) => i.content_type === 'movie'), [contentItems]);
  const series = useMemo(() => contentItems.filter((i) => i.content_type === 'series'), [contentItems]);
  const withArt = useMemo(() => contentItems.filter((i) => i.tvg_logo), [contentItems]);
  const trending = useMemo(() => shuffleSeed(withArt, new Date().getDate()).slice(0, 20), [withArt]);
  const topMovies = useMemo(() => movies.filter((m) => m.tvg_logo).slice(0, 10), [movies]);
  const topSeries = useMemo(() => series.filter((s) => s.tvg_logo).slice(0, 10), [series]);
  const recentlyAdded = useMemo(() => [...contentItems].reverse().slice(0, 20), [contentItems]);

  const movieGroups = useMemo(() => {
    const groups = new Map<string, PlaylistItem[]>();
    for (const m of movies) { const g = m.group_title || 'Movies'; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(m); }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  }, [movies]);

  const seriesGroups = useMemo(() => {
    const groups = new Map<string, PlaylistItem[]>();
    for (const s of series) { const g = s.group_title || 'Series'; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(s); }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 2);
  }, [series]);

  function handlePlay(item: PlaylistItem) { setPlayerItem(item); }

  const BROWSE_ROUTES: Record<string, string> = { channel: '/live-tv', movie: '/movies', series: '/series' };
  function navTo(type: string) {
    router.push(BROWSE_ROUTES[type] || '/playlists');
  }

  return (
    <div className="space-y-6">
      <HeroSection items={contentItems} playlists={playlists} onPlay={handlePlay} />

      <QuickStats playlists={playlists} />

      {loading && playlists.length > 0 && (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28 bg-white/[0.04]" />
              <div className="flex gap-2">
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={j} className="aspect-[2/3] w-[115px] rounded-lg shrink-0 bg-white/[0.04]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <>
          {trending.length > 3 && (
            <ContentRail title="Trending Now" items={trending} onSelectItem={handlePlay} size="wide" />
          )}

          {topMovies.length > 3 && (
            <ContentRail title="Top 10 Movies" icon={Film} items={topMovies} onSelectItem={handlePlay} showRank />
          )}

          {channels.length > 0 && (
            <ContentRail title="Live TV" icon={Tv} items={channels.slice(0, 30)} onSelectItem={handlePlay} onViewAll={() => navTo('channel')} size="wide" />
          )}

          {movies.length > 0 && (
            <ContentRail title="Movies" icon={Film} items={movies.slice(0, 25)} onSelectItem={handlePlay} onViewAll={() => navTo('movie')} />
          )}

          {movieGroups.map(([group, groupItems]) => (
            groupItems.length > 3 && (
              <ContentRail key={`m-${group}`} title={group} items={groupItems.slice(0, 20)} onSelectItem={handlePlay} />
            )
          ))}

          <CategoryGrid items={contentItems} onSelectItem={handlePlay} />

          {topSeries.length > 3 && (
            <ContentRail title="Top 10 Series" icon={Clapperboard} items={topSeries} onSelectItem={handlePlay} showRank />
          )}

          {series.length > 0 && (
            <ContentRail title="Series" icon={Clapperboard} items={series.slice(0, 25)} onSelectItem={handlePlay} onViewAll={() => navTo('series')} />
          )}

          {seriesGroups.map(([group, groupItems]) => (
            groupItems.length > 3 && (
              <ContentRail key={`s-${group}`} title={group} items={groupItems.slice(0, 20)} onSelectItem={handlePlay} />
            )
          ))}

          {recentlyAdded.length > 3 && (
            <ContentRail title="Recently Added" items={recentlyAdded} onSelectItem={handlePlay} size="wide" />
          )}
        </>
      )}

      <PlaylistShowcase playlists={playlists} />

      {playerItem && (
        <VideoPlayerDialog item={playerItem} onClose={() => setPlayerItem(null)} />
      )}
    </div>
  );
}
