'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Playlist, PlaylistItem } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import {
  Play, Tv, Film, Clapperboard, ChevronLeft, ChevronRight,
  ArrowRight, Plus, Zap, TrendingUp, Clock, Layers, Library,
} from 'lucide-react';

/* ════════════════════════════════════════════════════
   Shared visual utilities
   ════════════════════════════════════════════════════ */

const GRADIENTS = [
  'from-violet-600 to-purple-900',
  'from-blue-600 to-indigo-900',
  'from-rose-600 to-red-900',
  'from-amber-600 to-orange-900',
  'from-emerald-600 to-teal-900',
  'from-cyan-600 to-blue-900',
  'from-pink-600 to-fuchsia-900',
  'from-lime-600 to-green-900',
];

function gradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

const TYPE_ICON: Record<string, React.ElementType> = {
  channel: Tv,
  movie: Film,
  series: Clapperboard,
};

/* ════════════════════════════════════════════════════
   Cinematic Hero Banner
   ════════════════════════════════════════════════════ */

function HeroBanner({
  items,
  playlists,
  onPlay,
}: {
  items: PlaylistItem[];
  playlists: Playlist[];
  onPlay: (item: PlaylistItem) => void;
}) {
  const featured = useMemo(() => {
    const withArt = items.filter((i) => i.tvg_logo);
    if (withArt.length === 0) return null;
    const dayHash = new Date().getDate() + new Date().getHours();
    return withArt[dayHash % withArt.length];
  }, [items]);

  const [imgLoaded, setImgLoaded] = useState(false);
  const router = useRouter();

  const totalChannels = playlists.reduce((s, p) => s + p.channels_count, 0);
  const totalMovies = playlists.reduce((s, p) => s + p.movies_count, 0);
  const totalSeries = playlists.reduce((s, p) => s + p.series_count, 0);

  if (!featured && playlists.length === 0) {
    // Empty state — cinematic welcome
    return (
      <div className="relative rounded-2xl overflow-hidden h-[320px] sm:h-[380px] bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(120,80,255,0.15),transparent_60%)]" />
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs font-medium text-primary/80 uppercase tracking-wider">Get Started</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight max-w-xl">
            Your streaming library awaits
          </h1>
          <p className="text-sm sm:text-base text-white/50 mt-2 max-w-md">
            Add your first playlist to unlock channels, movies, and series — all in one premium experience.
          </p>
          <div className="mt-5">
            <Button
              size="lg"
              className="rounded-full px-6 gap-2 shadow-lg shadow-primary/25"
              onClick={() => router.push('/playlists')}
            >
              <Plus className="h-4 w-4" />
              Add Playlist
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const grad = gradient(featured?.name || 'default');

  return (
    <div className="relative rounded-2xl overflow-hidden h-[320px] sm:h-[380px]">
      {/* Background */}
      {featured?.tvg_logo ? (
        <>
          <img
            src={featured.tvg_logo}
            alt=""
            loading="eager"
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ${imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
            onLoad={() => setImgLoaded(true)}
          />
          {!imgLoaded && (
            <div className={`absolute inset-0 bg-gradient-to-br ${grad} animate-pulse`} />
          )}
        </>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad}`} />
      )}

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
        {/* Inline stats row */}
        <div className="flex items-center gap-4 mb-4">
          {totalChannels > 0 && (
            <div className="flex items-center gap-1.5 text-white/60">
              <Tv className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalChannels.toLocaleString()} Channels</span>
            </div>
          )}
          {totalMovies > 0 && (
            <div className="flex items-center gap-1.5 text-white/60">
              <Film className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalMovies.toLocaleString()} Movies</span>
            </div>
          )}
          {totalSeries > 0 && (
            <div className="flex items-center gap-1.5 text-white/60">
              <Clapperboard className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalSeries.toLocaleString()} Series</span>
            </div>
          )}
        </div>

        {featured ? (
          <>
            <Badge variant="secondary" className="w-fit mb-2 bg-white/10 text-white/70 border-0 text-[10px] uppercase tracking-wider">
              {featured.content_type === 'channel' ? 'Live Now' : featured.content_type === 'movie' ? 'Featured Film' : 'Featured Series'}
            </Badge>
            <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight line-clamp-2 max-w-lg">
              {featured.name}
            </h1>
            {featured.group_title && (
              <p className="text-sm text-white/40 mt-1">{featured.group_title}</p>
            )}
            <div className="flex items-center gap-3 mt-5">
              <Button
                size="lg"
                className="rounded-full px-6 gap-2 bg-white text-black hover:bg-white/90 shadow-lg"
                onClick={() => onPlay(featured)}
              >
                <Play className="h-4 w-4 fill-current" />
                Play
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full px-6 gap-2 border-white/20 text-white hover:bg-white/10 hover:text-white"
                onClick={() => {
                  const pl = playlists.find((p) => p.id === featured.playlist_id);
                  if (pl) router.push(`/playlists/${pl.id}`);
                }}
              >
                Browse Library
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight max-w-lg">
              Your Media Library
            </h1>
            <p className="text-sm text-white/50 mt-2 max-w-md">
              {playlists.length} playlist{playlists.length !== 1 ? 's' : ''} loaded with{' '}
              {(totalChannels + totalMovies + totalSeries).toLocaleString()} items
            </p>
            <div className="mt-5">
              <Button
                size="lg"
                className="rounded-full px-6 gap-2 bg-white text-black hover:bg-white/90 shadow-lg"
                onClick={() => router.push('/playlists')}
              >
                <Library className="h-4 w-4" />
                Browse Playlists
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Content Card (poster style, same as movie/series)
   ════════════════════════════════════════════════════ */

function ContentCard({
  item,
  onSelect,
  size = 'normal',
}: {
  item: PlaylistItem;
  onSelect: () => void;
  size?: 'normal' | 'wide';
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const grad = gradient(item.name);
  const Icon = TYPE_ICON[item.content_type] || Layers;

  if (size === 'wide') {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="group relative flex-shrink-0 rounded-xl overflow-hidden aspect-video min-w-[240px] max-w-[240px] sm:min-w-[280px] sm:max-w-[280px] transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl hover:shadow-black/30 hover:z-10"
      >
        {item.tvg_logo && !imgError ? (
          <>
            <img src={item.tvg_logo} alt="" loading="lazy" decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} />
            {!imgLoaded && <div className={`absolute inset-0 bg-gradient-to-br ${grad} animate-pulse`} />}
          </>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${grad}`}>
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon className="h-8 w-8 text-white/20" />
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-5 w-5 text-black fill-black ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-xs font-semibold text-white leading-tight line-clamp-2">{item.name}</p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex-shrink-0 rounded-xl overflow-hidden aspect-[2/3] min-w-[130px] max-w-[130px] sm:min-w-[150px] sm:max-w-[150px] transition-all duration-300 hover:scale-[1.05] hover:shadow-2xl hover:shadow-black/30 hover:z-10"
    >
      {item.tvg_logo && !imgError ? (
        <>
          <img src={item.tvg_logo} alt="" loading="lazy" decoding="async"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} />
          {!imgLoaded && <div className={`absolute inset-0 bg-gradient-to-br ${grad} animate-pulse`} />}
        </>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad}`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="h-8 w-8 text-white/20" />
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-[1px]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
          <Play className="h-5 w-5 text-black fill-black ml-0.5" />
        </div>
      </div>
      <div className="absolute top-2 left-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-black/50 backdrop-blur-sm">
          <Icon className="h-3 w-3 text-white/70" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <p className="text-[11px] font-semibold text-white leading-tight line-clamp-2">{item.name}</p>
        {item.group_title && (
          <p className="text-[9px] text-white/40 truncate mt-0.5">{item.group_title}</p>
        )}
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════
   Content Rail — Horizontal Scroll Row
   ════════════════════════════════════════════════════ */

function ContentRail({
  title,
  emoji,
  icon: RailIcon,
  items,
  onSelectItem,
  onViewAll,
  size = 'normal',
}: {
  title: string;
  emoji?: string;
  icon?: React.ElementType;
  items: PlaylistItem[];
  onSelectItem: (item: PlaylistItem) => void;
  onViewAll?: () => void;
  size?: 'normal' | 'wide';
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
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
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.75 : el.clientWidth * 0.75, behavior: 'smooth' });
  }

  if (items.length === 0) return null;

  return (
    <div className="group/rail space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
          {emoji && <span className="text-lg">{emoji}</span>}
          {RailIcon && !emoji && <RailIcon className="h-4.5 w-4.5 text-muted-foreground" />}
          {title}
        </h3>
        <div className="flex items-center gap-1">
          {onViewAll && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground gap-1 h-7" onClick={onViewAll}>
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          )}
          <div className="flex gap-0.5 opacity-0 group-hover/rail:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => scroll('left')} disabled={!canScrollLeft}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => scroll('right')} disabled={!canScrollRight}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-none scroll-smooth pb-2 -mx-1 px-1">
        {items.map((item) => (
          <ContentCard key={item.id} item={item} size={size} onSelect={() => onSelectItem(item)} />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Playlist Showcase Card
   ════════════════════════════════════════════════════ */

function PlaylistShowcase({
  playlists,
}: {
  playlists: Playlist[];
}) {
  const router = useRouter();

  if (playlists.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
          <Library className="h-4 w-4 text-muted-foreground" />
          Your Libraries
        </h3>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground gap-1 h-7" onClick={() => router.push('/playlists')}>
          Manage <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {playlists.slice(0, 6).map((pl) => {
          const grad = gradient(pl.name);
          const total = pl.channels_count + pl.movies_count + pl.series_count;
          return (
            <button
              key={pl.id}
              onClick={() => router.push(`/playlists/${pl.id}`)}
              className="group relative rounded-xl overflow-hidden h-[120px] text-left transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:scale-[1.02]"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${grad}`} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                <div>
                  <p className="text-sm font-bold text-white line-clamp-1">{pl.name}</p>
                  <p className="text-[11px] text-white/50 mt-0.5">{total.toLocaleString()} items</p>
                </div>
                <div className="flex items-center gap-3">
                  {pl.channels_count > 0 && (
                    <div className="flex items-center gap-1 text-white/60">
                      <Tv className="h-3 w-3" />
                      <span className="text-[10px]">{pl.channels_count}</span>
                    </div>
                  )}
                  {pl.movies_count > 0 && (
                    <div className="flex items-center gap-1 text-white/60">
                      <Film className="h-3 w-3" />
                      <span className="text-[10px]">{pl.movies_count}</span>
                    </div>
                  )}
                  {pl.series_count > 0 && (
                    <div className="flex items-center gap-1 text-white/60">
                      <Clapperboard className="h-3 w-3" />
                      <span className="text-[10px]">{pl.series_count}</span>
                    </div>
                  )}
                  <Badge
                    variant="secondary"
                    className={`ml-auto text-[9px] border-0 ${
                      pl.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : pl.status === 'error'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {pl.status}
                  </Badge>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Quick Stats Bar (compact, not dominating)
   ════════════════════════════════════════════════════ */

function QuickStats({ playlists }: { playlists: Playlist[] }) {
  const totalChannels = playlists.reduce((s, p) => s + p.channels_count, 0);
  const totalMovies = playlists.reduce((s, p) => s + p.movies_count, 0);
  const totalSeries = playlists.reduce((s, p) => s + p.series_count, 0);
  const totalItems = totalChannels + totalMovies + totalSeries;

  if (totalItems === 0) return null;

  const stats = [
    { label: 'Live Channels', value: totalChannels, icon: Tv, color: 'text-blue-400' },
    { label: 'Movies', value: totalMovies, icon: Film, color: 'text-purple-400' },
    { label: 'Series', value: totalSeries, icon: Clapperboard, color: 'text-amber-400' },
  ].filter((s) => s.value > 0);

  return (
    <div className="flex items-center gap-6 px-1 py-2">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <s.icon className={`h-4 w-4 ${s.color}`} />
          <div>
            <span className="text-lg font-bold tracking-tight">{s.value.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground ml-1.5">{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Main Media Home Component
   ════════════════════════════════════════════════════ */

export function MediaHome({
  playlists,
}: {
  playlists: Playlist[];
}) {
  const router = useRouter();
  const [contentItems, setContentItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch sample content from all playlists
  useEffect(() => {
    let cancelled = false;

    async function fetchContent() {
      if (playlists.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const allItems: PlaylistItem[] = [];

      // Fetch from up to 3 playlists in parallel
      const fetches = playlists.slice(0, 3).map(async (pl) => {
        try {
          const res = await fetch(`/api/playlists/${pl.id}/items?limit=100`);
          if (!res.ok) return [];
          const data = await res.json();
          return (data.items || []) as PlaylistItem[];
        } catch {
          return [];
        }
      });

      const results = await Promise.all(fetches);
      for (const items of results) allItems.push(...items);

      if (!cancelled) {
        setContentItems(allItems);
        setLoading(false);
      }
    }

    fetchContent();
    return () => { cancelled = true; };
  }, [playlists]);

  // Split by type
  const channels = useMemo(() => contentItems.filter((i) => i.content_type === 'channel'), [contentItems]);
  const movies = useMemo(() => contentItems.filter((i) => i.content_type === 'movie'), [contentItems]);
  const series = useMemo(() => contentItems.filter((i) => i.content_type === 'series'), [contentItems]);

  // Items with artwork (for "trending" rail)
  const withArt = useMemo(() => contentItems.filter((i) => i.tvg_logo).slice(0, 20), [contentItems]);

  // Unique groups for movies
  const movieGroups = useMemo(() => {
    const groups = new Map<string, PlaylistItem[]>();
    for (const m of movies) {
      const g = m.group_title || 'Movies';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(m);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);
  }, [movies]);

  function handlePlay(item: PlaylistItem) {
    router.push(`/playlists/${item.playlist_id}`);
  }

  function navToPlaylistTab(type: string) {
    const pl = playlists.find((p) => {
      if (type === 'channel') return p.channels_count > 0;
      if (type === 'movie') return p.movies_count > 0;
      if (type === 'series') return p.series_count > 0;
      return false;
    });
    if (pl) router.push(`/playlists/${pl.id}`);
  }

  return (
    <div className="space-y-8 -mt-2">
      {/* Cinematic Hero */}
      <HeroBanner items={contentItems} playlists={playlists} onPlay={handlePlay} />

      {/* Quick stats — compact inline bar */}
      <QuickStats playlists={playlists} />

      {/* Loading state */}
      {loading && playlists.length > 0 && (
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-36" />
              <div className="flex gap-3">
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={j} className="aspect-[2/3] w-[130px] rounded-xl shrink-0" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content Rails */}
      {!loading && (
        <>
          {/* Trending / Popular (items with artwork) */}
          {withArt.length > 3 && (
            <ContentRail
              title="Trending Now"
              emoji="🔥"
              items={withArt}
              onSelectItem={handlePlay}
              size="wide"
            />
          )}

          {/* Live Channels */}
          {channels.length > 0 && (
            <ContentRail
              title="Live Channels"
              icon={Tv}
              items={channels.slice(0, 30)}
              onSelectItem={handlePlay}
              onViewAll={() => navToPlaylistTab('channel')}
              size="wide"
            />
          )}

          {/* Movies */}
          {movies.length > 0 && (
            <ContentRail
              title="Movies"
              emoji="🎬"
              items={movies.slice(0, 25)}
              onSelectItem={handlePlay}
              onViewAll={() => navToPlaylistTab('movie')}
            />
          )}

          {/* Movie sub-categories */}
          {movieGroups.map(([group, items]) => (
            items.length > 3 && (
              <ContentRail
                key={group}
                title={group}
                items={items.slice(0, 25)}
                onSelectItem={handlePlay}
              />
            )
          ))}

          {/* Series */}
          {series.length > 0 && (
            <ContentRail
              title="Series"
              emoji="📺"
              items={series.slice(0, 25)}
              onSelectItem={handlePlay}
              onViewAll={() => navToPlaylistTab('series')}
            />
          )}
        </>
      )}

      {/* Playlist showcase cards */}
      <PlaylistShowcase playlists={playlists} />
    </div>
  );
}
