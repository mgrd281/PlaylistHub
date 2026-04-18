'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Playlist, PlaylistItem } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { VideoPlayerDialog } from '@/components/playlists/video-player-dialog';
import { useRouter } from 'next/navigation';
import {
  Play, Tv, Film, Clapperboard, ChevronLeft, ChevronRight,
  ArrowRight, Plus, Zap, Clock, Layers, Library, Sparkles,
  Star, TrendingUp, Radio, Flame, LayoutGrid,
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

function shuffleSeed<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.abs((seed * (i + 1) * 2654435761) | 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ════════════════════════════════════════════════════
   Hero Carousel — Multiple Featured Items
   ════════════════════════════════════════════════════ */

function HeroCarousel({
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

  const [activeIdx, setActiveIdx] = useState(0);
  const [imgStates, setImgStates] = useState<Record<number, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const router = useRouter();

  const totalChannels = playlists.reduce((s, p) => s + p.channels_count, 0);
  const totalMovies = playlists.reduce((s, p) => s + p.movies_count, 0);
  const totalSeries = playlists.reduce((s, p) => s + p.series_count, 0);

  // Auto-rotate
  useEffect(() => {
    if (heroItems.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIdx((i) => (i + 1) % heroItems.length);
    }, 7000);
    return () => clearInterval(timerRef.current);
  }, [heroItems.length]);

  function goTo(idx: number) {
    setActiveIdx(idx);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIdx((i) => (i + 1) % heroItems.length);
    }, 7000);
  }

  // Empty state
  if (heroItems.length === 0 && playlists.length === 0) {
    return (
      <div className="relative rounded-2xl overflow-hidden h-[340px] sm:h-[420px] bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(120,80,255,0.2),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.1),transparent_60%)]" />
        <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-6 sm:p-10">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center mb-6 shadow-2xl shadow-violet-500/30">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight max-w-xl">
            Your streaming library awaits
          </h1>
          <p className="text-sm sm:text-lg text-white/40 mt-3 max-w-md">
            Add your first playlist to unlock channels, movies, and series — all in one premium experience.
          </p>
          <Button
            size="lg"
            className="mt-8 rounded-full px-8 gap-2 shadow-lg shadow-primary/25 text-base"
            onClick={() => router.push('/playlists')}
          >
            <Plus className="h-5 w-5" />
            Add Your First Playlist
          </Button>
        </div>
      </div>
    );
  }

  // No featured items but have playlists
  if (heroItems.length === 0) {
    return (
      <div className="relative rounded-2xl overflow-hidden h-[280px] sm:h-[340px] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_60%)]" />
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
          <div className="flex items-center gap-4 mb-4">
            {totalChannels > 0 && <StatPill icon={Tv} value={totalChannels} label="Channels" />}
            {totalMovies > 0 && <StatPill icon={Film} value={totalMovies} label="Movies" />}
            {totalSeries > 0 && <StatPill icon={Clapperboard} value={totalSeries} label="Series" />}
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight max-w-lg">
            Your Media Library
          </h1>
          <p className="text-sm text-white/40 mt-2 max-w-md">
            {playlists.length} playlist{playlists.length !== 1 ? 's' : ''} loaded with{' '}
            {(totalChannels + totalMovies + totalSeries).toLocaleString()} items ready to stream
          </p>
          <div className="flex items-center gap-3 mt-5">
            <Button size="lg" className="rounded-full px-6 gap-2 bg-white text-black hover:bg-white/90 shadow-lg" onClick={() => router.push('/playlists')}>
              <Library className="h-4 w-4" />
              Browse Playlists
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const featured = heroItems[activeIdx];
  const grad = gradient(featured.name);

  return (
    <div className="relative rounded-2xl overflow-hidden h-[340px] sm:h-[420px]">
      {/* Background images — crossfade */}
      {heroItems.map((item, idx) => (
        <div key={item.id} className={`absolute inset-0 transition-opacity duration-1000 ${idx === activeIdx ? 'opacity-100' : 'opacity-0'}`}>
          {item.tvg_logo ? (
            <>
              <img
                src={item.tvg_logo}
                alt=""
                loading={idx < 2 ? 'eager' : 'lazy'}
                className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[12000ms] ${idx === activeIdx ? 'scale-105' : 'scale-100'}`}
                onLoad={() => setImgStates((s) => ({ ...s, [idx]: true }))}
              />
              {!imgStates[idx] && <div className={`absolute inset-0 bg-gradient-to-br ${gradient(item.name)} animate-pulse`} />}
            </>
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient(item.name)}`} />
          )}
        </div>
      ))}

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
        {/* Mini stats */}
        <div className="flex items-center gap-4 mb-4">
          {totalChannels > 0 && <StatPill icon={Tv} value={totalChannels} label="Channels" />}
          {totalMovies > 0 && <StatPill icon={Film} value={totalMovies} label="Movies" />}
          {totalSeries > 0 && <StatPill icon={Clapperboard} value={totalSeries} label="Series" />}
        </div>

        <Badge variant="secondary" className="w-fit mb-2 bg-white/10 text-white/70 border-0 text-[10px] uppercase tracking-wider backdrop-blur-sm">
          {featured.content_type === 'channel' ? 'Live Now' : featured.content_type === 'movie' ? 'Featured Film' : 'Featured Series'}
        </Badge>
        <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight line-clamp-2 max-w-xl">
          {featured.name}
        </h1>
        {featured.group_title && (
          <p className="text-sm text-white/35 mt-1">{featured.group_title}</p>
        )}
        <div className="flex items-center gap-3 mt-5">
          <Button
            size="lg"
            className="rounded-full px-7 gap-2 bg-white text-black hover:bg-white/90 shadow-xl text-sm font-semibold"
            onClick={() => onPlay(featured)}
          >
            <Play className="h-4 w-4 fill-current" />
            Play Now
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="rounded-full px-7 gap-2 border-white/20 text-white hover:bg-white/10 hover:text-white text-sm"
            onClick={() => {
              const pl = playlists.find((p) => p.id === featured.playlist_id);
              if (pl) router.push(`/playlists/${pl.id}`);
            }}
          >
            More Info
          </Button>
        </div>

        {/* Carousel dots */}
        {heroItems.length > 1 && (
          <div className="flex items-center gap-2 mt-6">
            {heroItems.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goTo(idx)}
                className={`transition-all duration-300 rounded-full ${idx === activeIdx ? 'w-8 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/50'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-white/50">
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">{value.toLocaleString()} {label}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Quick Access Cards — Channels / Movies / Series
   ════════════════════════════════════════════════════ */

function QuickAccessCards({ playlists }: { playlists: Playlist[] }) {
  const router = useRouter();
  const totalChannels = playlists.reduce((s, p) => s + p.channels_count, 0);
  const totalMovies = playlists.reduce((s, p) => s + p.movies_count, 0);
  const totalSeries = playlists.reduce((s, p) => s + p.series_count, 0);

  if (totalChannels + totalMovies + totalSeries === 0) return null;

  function navTo(type: string) {
    const pl = playlists.find((p) => {
      if (type === 'channel') return p.channels_count > 0;
      if (type === 'movie') return p.movies_count > 0;
      if (type === 'series') return p.series_count > 0;
      return false;
    });
    if (pl) router.push(`/playlists/${pl.id}`);
    else router.push('/playlists');
  }

  const cards = [
    { label: 'Live TV', count: totalChannels, icon: Tv, gradient: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/20', type: 'channel' },
    { label: 'Movies', count: totalMovies, icon: Film, gradient: 'from-purple-500 to-violet-600', shadow: 'shadow-purple-500/20', type: 'movie' },
    { label: 'Series', count: totalSeries, icon: Clapperboard, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/20', type: 'series' },
  ].filter((c) => c.count > 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {cards.map((c) => (
        <button
          key={c.type}
          type="button"
          onClick={() => navTo(c.type)}
          className={`group relative rounded-xl overflow-hidden p-4 sm:p-5 text-left transition-all duration-300 hover:scale-[1.03] hover:shadow-xl ${c.shadow}`}
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient} opacity-90`} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-white">{c.count.toLocaleString()}</p>
              <p className="text-xs sm:text-sm font-semibold text-white/80 mt-0.5">{c.label}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm group-hover:bg-white/25 transition-colors">
              <c.icon className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="relative mt-3">
            <div className="flex items-center gap-1 text-white/60 text-[11px] font-medium group-hover:text-white/80 transition-colors">
              <span>Browse All</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Content Card — Poster & Wide modes
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
  const grad = gradient(item.name);
  const Icon = TYPE_ICON[item.content_type] || Layers;

  if (size === 'wide') {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="group relative flex-shrink-0 rounded-xl overflow-hidden aspect-video min-w-[220px] max-w-[220px] sm:min-w-[280px] sm:max-w-[280px] transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl hover:shadow-black/40 hover:z-10"
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
              <Icon className="h-10 w-10 text-white/15" />
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="h-5 w-5 text-black fill-black ml-0.5" />
          </div>
        </div>
        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <div className="flex items-center gap-1 rounded-md bg-black/50 backdrop-blur-sm px-1.5 py-0.5">
            <Icon className="h-2.5 w-2.5 text-white/60" />
            <span className="text-[9px] text-white/60 font-medium capitalize">{item.content_type}</span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-xs font-semibold text-white leading-tight line-clamp-2">{item.name}</p>
          {item.group_title && <p className="text-[9px] text-white/35 truncate mt-0.5">{item.group_title}</p>}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex-shrink-0 rounded-xl overflow-hidden aspect-[2/3] min-w-[120px] max-w-[120px] sm:min-w-[145px] sm:max-w-[145px] transition-all duration-300 hover:scale-[1.05] hover:shadow-2xl hover:shadow-black/40 hover:z-10"
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
            <Icon className="h-8 w-8 text-white/15" />
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-[1px]">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-lg transform scale-75 group-hover:scale-100 transition-transform duration-300">
          <Play className="h-4 w-4 text-black fill-black ml-0.5" />
        </div>
      </div>
      {/* Rank number */}
      {rank != null && (
        <div className="absolute top-0 left-0 flex items-center justify-center">
          <span className="text-[40px] font-black text-white/10 leading-none pl-1 pt-0">{rank}</span>
        </div>
      )}
      {/* Type icon */}
      {!rank && (
        <div className="absolute top-2 left-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-black/50 backdrop-blur-sm">
            <Icon className="h-3 w-3 text-white/60" />
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <p className="text-[11px] font-semibold text-white leading-tight line-clamp-2">{item.name}</p>
        {item.group_title && (
          <p className="text-[9px] text-white/30 truncate mt-0.5">{item.group_title}</p>
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
  showRank,
}: {
  title: string;
  emoji?: string;
  icon?: React.ElementType;
  items: PlaylistItem[];
  onSelectItem: (item: PlaylistItem) => void;
  onViewAll?: () => void;
  size?: 'normal' | 'wide';
  showRank?: boolean;
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
    <div className="group/rail space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
          {emoji && <span className="text-base">{emoji}</span>}
          {RailIcon && !emoji && <RailIcon className="h-4 w-4 text-muted-foreground/70" />}
          {title}
          <span className="text-[11px] font-normal text-muted-foreground/40">{items.length}</span>
        </h3>
        <div className="flex items-center gap-1">
          {onViewAll && (
            <Button variant="ghost" size="sm" className="text-[11px] text-muted-foreground/60 hover:text-foreground gap-1 h-7 px-2" onClick={onViewAll}>
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
      <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto scrollbar-none scroll-smooth pb-1 -mx-1 px-1">
        {items.map((item, idx) => (
          <ContentCard key={item.id} item={item} size={size} rank={showRank ? idx + 1 : undefined} onSelect={() => onSelectItem(item)} />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Playlist Showcase — Your Libraries
   ════════════════════════════════════════════════════ */

function PlaylistShowcase({ playlists }: { playlists: Playlist[] }) {
  const router = useRouter();
  if (playlists.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
          <Library className="h-4 w-4 text-muted-foreground/70" />
          Your Libraries
        </h3>
        <Button variant="ghost" size="sm" className="text-[11px] text-muted-foreground/60 hover:text-foreground gap-1 h-7 px-2" onClick={() => router.push('/playlists')}>
          Manage <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {playlists.slice(0, 6).map((pl) => {
          const grad = gradient(pl.name);
          const total = pl.channels_count + pl.movies_count + pl.series_count;
          return (
            <button
              key={pl.id}
              onClick={() => router.push(`/playlists/${pl.id}`)}
              className="group relative rounded-xl overflow-hidden h-[100px] text-left transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:scale-[1.02]"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${grad}`} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
              <div className="absolute inset-0 p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-sm font-bold text-white line-clamp-1">{pl.name}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">{total.toLocaleString()} items</p>
                </div>
                <div className="flex items-center gap-3">
                  {pl.channels_count > 0 && <MiniStat icon={Tv} value={pl.channels_count} />}
                  {pl.movies_count > 0 && <MiniStat icon={Film} value={pl.movies_count} />}
                  {pl.series_count > 0 && <MiniStat icon={Clapperboard} value={pl.series_count} />}
                  <Badge
                    variant="secondary"
                    className={`ml-auto text-[8px] border-0 ${
                      pl.status === 'active' ? 'bg-emerald-500/20 text-emerald-300'
                        : pl.status === 'error' ? 'bg-red-500/20 text-red-300'
                        : 'bg-white/10 text-white/50'
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

function MiniStat({ icon: Icon, value }: { icon: React.ElementType; value: number }) {
  return (
    <div className="flex items-center gap-1 text-white/50">
      <Icon className="h-3 w-3" />
      <span className="text-[10px]">{value}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Category Quick Grid
   ════════════════════════════════════════════════════ */

function CategoryGrid({
  items,
  onSelectItem,
}: {
  items: PlaylistItem[];
  onSelectItem: (item: PlaylistItem) => void;
}) {
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
    <div className="space-y-2.5">
      <h3 className="text-sm font-bold tracking-tight flex items-center gap-2 px-1">
        <LayoutGrid className="h-4 w-4 text-muted-foreground/70" />
        Categories
        <span className="text-[11px] font-normal text-muted-foreground/40">{categories.length}</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {categories.map(([name, { items: catItems, sample }]) => {
          const grad = gradient(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelectItem(catItems[0])}
              className="group relative rounded-lg overflow-hidden h-[72px] text-left transition-all duration-300 hover:scale-[1.03] hover:shadow-lg"
            >
              {sample.tvg_logo ? (
                <img src={sample.tvg_logo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${grad}`} />
              )}
              <div className="absolute inset-0 bg-black/60 group-hover:bg-black/50 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs font-bold text-white line-clamp-1 px-2">{name}</p>
                  <p className="text-[9px] text-white/40 mt-0.5">{catItems.length} items</p>
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
   Main Media Home Component
   ════════════════════════════════════════════════════ */

export function MediaHome({ playlists }: { playlists: Playlist[] }) {
  const router = useRouter();
  const [contentItems, setContentItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerItem, setPlayerItem] = useState<PlaylistItem | null>(null);

  // Fetch content from all playlists
  useEffect(() => {
    let cancelled = false;

    async function fetchContent() {
      if (playlists.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const allItems: PlaylistItem[] = [];

      // Fetch from up to 5 playlists in parallel (more data = richer dashboard)
      const fetches = playlists.slice(0, 5).map(async (pl) => {
        try {
          const res = await fetch(`/api/playlists/${pl.id}/items?limit=200`);
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

  // Items with artwork — for featured/trending
  const withArt = useMemo(() => contentItems.filter((i) => i.tvg_logo), [contentItems]);
  const trendingItems = useMemo(() => shuffleSeed(withArt, new Date().getDate()).slice(0, 25), [withArt]);

  // "Top 10" style — highest-visibility items
  const topMovies = useMemo(() => movies.filter((m) => m.tvg_logo).slice(0, 10), [movies]);
  const topSeries = useMemo(() => series.filter((s) => s.tvg_logo).slice(0, 10), [series]);

  // Recently added — last items in array (usually newest)
  const recentlyAdded = useMemo(() => [...contentItems].reverse().slice(0, 25), [contentItems]);

  // Movie genre groups
  const movieGroups = useMemo(() => {
    const groups = new Map<string, PlaylistItem[]>();
    for (const m of movies) {
      const g = m.group_title || 'Movies';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(m);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4);
  }, [movies]);

  // Series genre groups
  const seriesGroups = useMemo(() => {
    const groups = new Map<string, PlaylistItem[]>();
    for (const s of series) {
      const g = s.group_title || 'Series';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(s);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);
  }, [series]);

  function handlePlay(item: PlaylistItem) {
    setPlayerItem(item);
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
    <div className="space-y-6 -mt-2">
      {/* Hero Carousel */}
      <HeroCarousel items={contentItems} playlists={playlists} onPlay={handlePlay} />

      {/* Quick Access Cards */}
      <QuickAccessCards playlists={playlists} />

      {/* Loading skeleton */}
      {loading && playlists.length > 0 && (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2.5">
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2.5">
                {Array.from({ length: 8 }).map((_, j) => (
                  <Skeleton key={j} className="aspect-[2/3] w-[120px] rounded-xl shrink-0" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content Rails */}
      {!loading && (
        <>
          {/* Trending Now — Wide cards */}
          {trendingItems.length > 3 && (
            <ContentRail
              title="Trending Now"
              icon={Flame}
              items={trendingItems}
              onSelectItem={handlePlay}
              size="wide"
            />
          )}

          {/* Top 10 Movies — With rank numbers */}
          {topMovies.length > 3 && (
            <ContentRail
              title="Top Movies"
              icon={Star}
              items={topMovies}
              onSelectItem={handlePlay}
              showRank
            />
          )}

          {/* Live Channels */}
          {channels.length > 0 && (
            <ContentRail
              title="Live TV"
              icon={Radio}
              items={channels.slice(0, 35)}
              onSelectItem={handlePlay}
              onViewAll={() => navToPlaylistTab('channel')}
              size="wide"
            />
          )}

          {/* All Movies */}
          {movies.length > 0 && (
            <ContentRail
              title="Movies"
              icon={Film}
              items={movies.slice(0, 30)}
              onSelectItem={handlePlay}
              onViewAll={() => navToPlaylistTab('movie')}
            />
          )}

          {/* Movie genre rails */}
          {movieGroups.map(([group, groupItems]) => (
            groupItems.length > 3 && (
              <ContentRail
                key={`movie-${group}`}
                title={group}
                items={groupItems.slice(0, 25)}
                onSelectItem={handlePlay}
              />
            )
          ))}

          {/* Category Grid */}
          <CategoryGrid items={contentItems} onSelectItem={handlePlay} />

          {/* Top Series — With rank numbers */}
          {topSeries.length > 3 && (
            <ContentRail
              title="Top Series"
              icon={Star}
              items={topSeries}
              onSelectItem={handlePlay}
              showRank
            />
          )}

          {/* All Series */}
          {series.length > 0 && (
            <ContentRail
              title="Series"
              icon={Clapperboard}
              items={series.slice(0, 30)}
              onSelectItem={handlePlay}
              onViewAll={() => navToPlaylistTab('series')}
            />
          )}

          {/* Series genre rails */}
          {seriesGroups.map(([group, groupItems]) => (
            groupItems.length > 3 && (
              <ContentRail
                key={`series-${group}`}
                title={group}
                items={groupItems.slice(0, 25)}
                onSelectItem={handlePlay}
              />
            )
          ))}

          {/* Recently Added */}
          {recentlyAdded.length > 3 && (
            <ContentRail
              title="Recently Added"
              icon={Sparkles}
              items={recentlyAdded}
              onSelectItem={handlePlay}
              size="wide"
            />
          )}
        </>
      )}

      {/* Playlist Libraries */}
      <PlaylistShowcase playlists={playlists} />

      {/* Video Player */}
      {playerItem && (
        <VideoPlayerDialog item={playerItem} onClose={() => setPlayerItem(null)} />
      )}
    </div>
  );
}
