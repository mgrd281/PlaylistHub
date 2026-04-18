'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlaylistItem } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Search, Clapperboard, Play, Star, ChevronLeft, ChevronRight,
  Grid3X3, LayoutList, X, ChevronDown, ListVideo, Tv2,
} from 'lucide-react';

/* ════════════════════════════════════════════════════
   Genre Classifier for Series
   ════════════════════════════════════════════════════ */

interface GenreDef {
  id: string;
  label: string;
  emoji: string;
  test: (text: string) => boolean;
}

const SERIES_GENRES: GenreDef[] = [
  { id: 'action', label: 'Action', emoji: '💥', test: (t) => /action|fight|war|battle|martial|combat|mission|strike|warrior/i.test(t) },
  { id: 'comedy', label: 'Comedy', emoji: '😂', test: (t) => /comedy|comic|funny|laugh|humor|sitcom/i.test(t) },
  { id: 'drama', label: 'Drama', emoji: '🎭', test: (t) => /drama|dramatic/i.test(t) },
  { id: 'crime', label: 'Crime', emoji: '🔍', test: (t) => /crime|detective|police|fbi|cia|law|court|prison|mafia|cartel|narco/i.test(t) },
  { id: 'scifi', label: 'Sci-Fi', emoji: '🚀', test: (t) => /sci.?fi|science fiction|space|alien|future|cyber|robot|galaxy|star trek|star wars/i.test(t) },
  { id: 'romance', label: 'Romance', emoji: '💕', test: (t) => /romance|romantic|love|wedding|heart/i.test(t) },
  { id: 'horror', label: 'Horror', emoji: '👻', test: (t) => /horror|scary|zombie|ghost|haunted|evil|terror|fear|dark|vampire|witch/i.test(t) },
  { id: 'animation', label: 'Animation', emoji: '🎨', test: (t) => /animat|cartoon|anime|manga|toon/i.test(t) },
  { id: 'documentary', label: 'Documentary', emoji: '📹', test: (t) => /document|docu|bbc|national geographic|true story/i.test(t) },
  { id: 'arabic', label: 'Arabic / Turkish', emoji: '🌙', test: (t) => /arab|مسلسل|عرب|مصر|turk|turkish|hindi|bollywood|indian|korean|k-drama|مدبلج|مترجم/i.test(t) },
  { id: 'reality', label: 'Reality', emoji: '📺', test: (t) => /reality|contest|competition|survivor|bachelor|talent|masterchef|big brother/i.test(t) },
];

function classifySeries(name: string, group: string): string {
  const text = `${group} ${name}`;
  for (const genre of SERIES_GENRES) {
    if (genre.test(text)) return genre.id;
  }
  return 'all';
}

/* ════════════════════════════════════════════════════
   Extract season/episode info from name
   ════════════════════════════════════════════════════ */

interface EpisodeInfo {
  showName: string;
  season: number | null;
  episode: number | null;
  label: string;
}

function parseEpisode(name: string): EpisodeInfo {
  // Try S01E02 pattern
  const seMatch = name.match(/^(.+?)\s*[-.]*\s*S(\d{1,3})\s*E(\d{1,4})/i);
  if (seMatch) {
    return {
      showName: seMatch[1].trim(),
      season: parseInt(seMatch[2], 10),
      episode: parseInt(seMatch[3], 10),
      label: `S${seMatch[2].padStart(2, '0')}E${seMatch[3].padStart(2, '0')}`,
    };
  }

  // Try "Season 1 Episode 2" pattern
  const longMatch = name.match(/^(.+?)\s*[-.]?\s*Season\s*(\d+)\s*[-.]?\s*Episode\s*(\d+)/i);
  if (longMatch) {
    return {
      showName: longMatch[1].trim(),
      season: parseInt(longMatch[2], 10),
      episode: parseInt(longMatch[3], 10),
      label: `S${longMatch[2].padStart(2, '0')}E${longMatch[3].padStart(2, '0')}`,
    };
  }

  // Try "E02" or "EP02" only
  const epOnly = name.match(/^(.+?)\s*[-.]?\s*(?:EP?|Episode)\s*(\d{1,4})/i);
  if (epOnly) {
    return {
      showName: epOnly[1].trim(),
      season: null,
      episode: parseInt(epOnly[2], 10),
      label: `EP ${epOnly[2]}`,
    };
  }

  return { showName: name, season: null, episode: null, label: '' };
}

/* ════════════════════════════════════════════════════
   Show grouping types
   ════════════════════════════════════════════════════ */

interface ShowGroup {
  name: string;
  genre: string;
  poster: string | null;
  episodes: PlaylistItem[];
  seasonCount: number;
  groupTitle: string;
}

function groupIntoShows(items: PlaylistItem[]): ShowGroup[] {
  // Group by group_title first (provider-defined show grouping)
  const byGroup = new Map<string, PlaylistItem[]>();

  for (const item of items) {
    const key = item.group_title || parseEpisode(item.name).showName || 'Unknown';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(item);
  }

  const shows: ShowGroup[] = [];

  for (const [groupName, episodes] of byGroup) {
    // Find the best poster (first one with tvg_logo)
    const poster = episodes.find((e) => e.tvg_logo)?.tvg_logo || null;

    // Count distinct seasons
    const seasons = new Set<number>();
    for (const ep of episodes) {
      const info = parseEpisode(ep.name);
      if (info.season !== null) seasons.add(info.season);
    }

    // Sort episodes by season/episode
    episodes.sort((a, b) => {
      const ia = parseEpisode(a.name);
      const ib = parseEpisode(b.name);
      if (ia.season !== ib.season) return (ia.season || 0) - (ib.season || 0);
      return (ia.episode || 0) - (ib.episode || 0);
    });

    shows.push({
      name: groupName,
      genre: classifySeries(groupName, episodes.map((e) => e.name).slice(0, 3).join(' ')),
      poster,
      episodes,
      seasonCount: seasons.size || 1,
      groupTitle: groupName,
    });
  }

  // Sort by episode count (most popular/biggest first)
  shows.sort((a, b) => b.episodes.length - a.episodes.length);

  return shows;
}

/* ════════════════════════════════════════════════════
   Gradient & Visual Utilities (shared design with Movies)
   ════════════════════════════════════════════════════ */

const POSTER_GRADIENTS = [
  'from-violet-600 to-purple-900',
  'from-blue-600 to-indigo-900',
  'from-rose-600 to-red-900',
  'from-amber-600 to-orange-900',
  'from-emerald-600 to-teal-900',
  'from-cyan-600 to-blue-900',
  'from-pink-600 to-fuchsia-900',
  'from-lime-600 to-green-900',
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return POSTER_GRADIENTS[Math.abs(hash) % POSTER_GRADIENTS.length];
}

/* ════════════════════════════════════════════════════
   Show Poster Card — Premium Design
   ════════════════════════════════════════════════════ */

const ShowCard = memo(function ShowCard({
  show,
  onSelect,
  size = 'normal',
}: {
  show: ShowGroup;
  onSelect: () => void;
  size?: 'normal' | 'featured' | 'compact';
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const gradient = getGradient(show.name);

  const sizeClasses = {
    featured: 'aspect-[2/3] min-w-[200px] max-w-[200px] sm:min-w-[220px] sm:max-w-[220px]',
    normal: 'aspect-[2/3] min-w-[140px] max-w-[140px] sm:min-w-[160px] sm:max-w-[160px]',
    compact: 'aspect-[2/3] min-w-[120px] max-w-[120px] sm:min-w-[130px] sm:max-w-[130px]',
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex-shrink-0 rounded-xl overflow-hidden ${sizeClasses[size]} transition-all duration-300 hover:scale-[1.05] hover:shadow-2xl hover:shadow-black/30 hover:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {/* Background Image or Gradient */}
      {show.poster && !imgError ? (
        <>
          <img
            src={show.poster}
            alt=""
            loading="lazy"
            decoding="async"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
          {!imgLoaded && (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} animate-pulse`} />
          )}
        </>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <Clapperboard className="h-10 w-10 text-white/20" />
          </div>
          {/* Decorative episode bars */}
          <div className="absolute top-3 left-3 right-3 space-y-1">
            {Array.from({ length: Math.min(show.seasonCount, 4) }).map((_, i) => (
              <div key={i} className="h-0.5 rounded-full bg-white/10" style={{ width: `${80 - i * 15}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      {/* Hover play overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-[2px]">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-xl shadow-black/20 transition-transform duration-300 group-hover:scale-110">
          <Play className="h-6 w-6 text-black fill-black ml-0.5" />
        </div>
      </div>

      {/* Episode count badge */}
      <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
        <ListVideo className="h-2.5 w-2.5" />
        {show.episodes.length}
      </div>

      {/* Season badge */}
      {show.seasonCount > 1 && (
        <div className="absolute top-2 left-2 rounded-md bg-amber-500/80 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {show.seasonCount}S
        </div>
      )}

      {/* Title area */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className={`font-semibold text-white leading-tight line-clamp-2 ${size === 'featured' ? 'text-sm' : 'text-xs'}`}>
          {show.name}
        </p>
        <p className="mt-0.5 text-[10px] text-white/50">
          {show.episodes.length} episode{show.episodes.length !== 1 ? 's' : ''}
          {show.seasonCount > 1 ? ` · ${show.seasonCount} seasons` : ''}
        </p>
      </div>
    </button>
  );
});

/* ════════════════════════════════════════════════════
   Show Rail — Horizontal Scroll Row
   ════════════════════════════════════════════════════ */

function ShowRail({
  title,
  emoji,
  shows,
  onSelectShow,
  size = 'normal',
}: {
  title: string;
  emoji?: string;
  shows: ShowGroup[];
  onSelectShow: (show: ShowGroup) => void;
  size?: 'normal' | 'featured' | 'compact';
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, shows]);

  function scroll(dir: 'left' | 'right') {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  if (shows.length === 0) return null;

  return (
    <div className="group/rail space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
          {emoji && <span className="text-lg">{emoji}</span>}
          {title}
          <span className="text-xs font-normal text-muted-foreground ml-1">
            {shows.length}
          </span>
        </h3>
        <div className="flex gap-1 opacity-0 group-hover/rail:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => scroll('left')} disabled={!canScrollLeft}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => scroll('right')} disabled={!canScrollRight}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-none scroll-smooth pb-2 -mx-1 px-1"
      >
        {shows.map((show) => (
          <ShowCard
            key={show.name}
            show={show}
            size={size}
            onSelect={() => onSelectShow(show)}
          />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Show Grid View
   ════════════════════════════════════════════════════ */

function ShowGrid({
  shows,
  onSelectShow,
}: {
  shows: ShowGroup[];
  onSelectShow: (show: ShowGroup) => void;
}) {
  if (shows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20">
        <div className="rounded-full bg-muted p-4 mb-3">
          <Clapperboard className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground font-medium">No series found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
      {shows.map((show) => (
        <ShowCard
          key={show.name}
          show={show}
          size="normal"
          onSelect={() => onSelectShow(show)}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Hero Featured Show
   ════════════════════════════════════════════════════ */

function HeroShow({
  show,
  onSelect,
}: {
  show: ShowGroup;
  onSelect: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const gradient = getGradient(show.name);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative w-full rounded-2xl overflow-hidden h-[280px] sm:h-[320px] transition-all duration-500 hover:shadow-2xl hover:shadow-black/20"
    >
      {show.poster ? (
        <>
          <img
            src={show.poster}
            alt=""
            loading="eager"
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ${imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'} group-hover:scale-105`}
            onLoad={() => setImgLoaded(true)}
          />
          {!imgLoaded && (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} animate-pulse`} />
          )}
        </>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
          <span className="text-xs font-medium text-amber-400">Featured Series</span>
          <span className="text-xs text-white/60 ml-2">
            {show.episodes.length} episodes
            {show.seasonCount > 1 ? ` · ${show.seasonCount} seasons` : ''}
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight line-clamp-2 max-w-lg">
          {show.name}
        </h2>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg transition-transform group-hover:scale-105">
            <Play className="h-4 w-4 fill-current" />
            Browse Episodes
          </div>
        </div>
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════
   Episode List Panel (expanded show detail)
   ════════════════════════════════════════════════════ */

function EpisodePanel({
  show,
  onSelectEpisode,
  onBack,
}: {
  show: ShowGroup;
  onSelectEpisode: (item: PlaylistItem) => void;
  onBack: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const gradient = getGradient(show.name);

  // Group episodes by season
  const seasons = useMemo(() => {
    const map = new Map<number, PlaylistItem[]>();
    const noSeason: PlaylistItem[] = [];

    for (const ep of show.episodes) {
      const info = parseEpisode(ep.name);
      if (info.season !== null) {
        if (!map.has(info.season)) map.set(info.season, []);
        map.get(info.season)!.push(ep);
      } else {
        noSeason.push(ep);
      }
    }

    const result: { season: number | null; episodes: PlaylistItem[] }[] = [];

    // Sort seasons
    const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
    for (const key of sortedKeys) {
      result.push({ season: key, episodes: map.get(key)! });
    }

    if (noSeason.length > 0) {
      result.push({ season: null, episodes: noSeason });
    }

    return result;
  }, [show]);

  const [activeSeason, setActiveSeason] = useState<number | null>(
    seasons[0]?.season ?? null
  );

  const currentEpisodes = useMemo(() => {
    if (seasons.length <= 1) return show.episodes;
    return seasons.find((s) => s.season === activeSeason)?.episodes || show.episodes;
  }, [seasons, activeSeason, show.episodes]);

  return (
    <div className="space-y-4">
      {/* Show header with poster */}
      <div className="relative rounded-2xl overflow-hidden">
        <div className={`h-[180px] sm:h-[220px] ${show.poster ? '' : `bg-gradient-to-br ${gradient}`}`}>
          {show.poster && !imgError ? (
            <>
              <img
                src={show.poster}
                alt=""
                loading="eager"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
              />
              {!imgLoaded && (
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} animate-pulse`} />
              )}
            </>
          ) : null}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />

        <div className="absolute bottom-0 left-0 right-0 p-5">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white mb-2 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to Series
          </button>
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">{show.name}</h2>
          <p className="text-sm text-white/50 mt-1">
            {show.episodes.length} episode{show.episodes.length !== 1 ? 's' : ''}
            {show.seasonCount > 1 ? ` · ${show.seasonCount} seasons` : ''}
          </p>
        </div>
      </div>

      {/* Season tabs (if multiple seasons) */}
      {seasons.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
          {seasons.map((s) => (
            <button
              key={s.season ?? 'all'}
              onClick={() => setActiveSeason(s.season)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                activeSeason === s.season
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {s.season !== null ? `Season ${s.season}` : 'Episodes'}
              <span className="ml-1 opacity-60">{s.episodes.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Episode list */}
      <div className="space-y-1.5">
        {currentEpisodes.map((ep, idx) => {
          const info = parseEpisode(ep.name);
          return (
            <button
              key={ep.id}
              type="button"
              onClick={() => onSelectEpisode(ep)}
              className="group flex items-center gap-3 w-full rounded-xl border bg-card p-3 text-left transition-all hover:bg-accent/50 hover:border-foreground/15 hover:shadow-sm active:scale-[0.99]"
            >
              {/* Episode number */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-sm font-bold text-muted-foreground">
                {info.episode ?? idx + 1}
              </div>

              {/* Thumbnail or mini poster */}
              {ep.tvg_logo ? (
                <div className="relative h-10 w-16 shrink-0 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={ep.tvg_logo}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : null}

              {/* Title & metadata */}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium leading-snug">{ep.name}</p>
                {info.label && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{info.label}</p>
                )}
              </div>

              {/* Play button */}
              <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Play className="h-3.5 w-3.5 fill-current" />
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
   Main Series Browser Component
   ════════════════════════════════════════════════════ */

export function SeriesBrowser({
  playlistId,
  totalSeries,
  onSelectItem,
}: {
  playlistId: string;
  totalSeries: number;
  onSelectItem: (item: PlaylistItem) => void;
}) {
  const [allItems, setAllItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'browse' | 'grid'>('browse');
  const [selectedShow, setSelectedShow] = useState<ShowGroup | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 500;

  // Fetch all series items
  useEffect(() => {
    let cancelled = false;

    async function fetchSeries() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          type: 'series',
          limit: ITEMS_PER_PAGE.toString(),
          page: page.toString(),
        });
        const res = await fetch(`/api/playlists/${playlistId}/items?${params}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled) {
          setAllItems(data.items || []);
        }
      } catch {
        if (!cancelled) setAllItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSeries();
    return () => { cancelled = true; };
  }, [playlistId, page]);

  // Group into shows
  const shows = useMemo(() => groupIntoShows(allItems), [allItems]);

  // Group shows by genre
  const showsByGenre = useMemo(() => {
    const map = new Map<string, ShowGroup[]>();
    for (const show of shows) {
      if (!map.has(show.genre)) map.set(show.genre, []);
      map.get(show.genre)!.push(show);
    }
    return map;
  }, [shows]);

  // Filtered shows
  const filteredShows = useMemo(() => {
    let result = shows;

    if (activeGenre) {
      result = showsByGenre.get(activeGenre) || [];
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.episodes.some((e) => e.name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [shows, search, activeGenre, showsByGenre]);

  // Featured show (biggest with poster)
  const featuredShow = useMemo(() => {
    const withPoster = shows.filter((s) => s.poster);
    if (withPoster.length === 0) return shows[0] || null;
    const dayHash = new Date().getDate();
    return withPoster[dayHash % withPoster.length];
  }, [shows]);

  // Genre pills
  const genrePills = useMemo(() => {
    return SERIES_GENRES.filter((g) => showsByGenre.has(g.id) && showsByGenre.get(g.id)!.length > 0);
  }, [showsByGenre]);

  // If a show is selected, show episode panel
  if (selectedShow) {
    return (
      <EpisodePanel
        show={selectedShow}
        onSelectEpisode={onSelectItem}
        onBack={() => setSelectedShow(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[280px] w-full rounded-2xl" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <div className="flex gap-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <Skeleton key={j} className="aspect-[2/3] w-[140px] rounded-xl shrink-0" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      {viewMode === 'browse' && !search && !activeGenre && featuredShow && (
        <HeroShow show={featuredShow} onSelect={() => setSelectedShow(featuredShow)} />
      )}

      {/* Search & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-full bg-muted/50 border-0 focus-visible:ring-1"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filteredShows.length} show{filteredShows.length !== 1 ? 's' : ''}
          </span>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode('browse')}
              className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'browse' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Genre Pills */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
        <button
          onClick={() => setActiveGenre(null)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
            !activeGenre
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          All
        </button>
        {genrePills.map((genre) => (
          <button
            key={genre.id}
            onClick={() => setActiveGenre(activeGenre === genre.id ? null : genre.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
              activeGenre === genre.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {genre.emoji} {genre.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {viewMode === 'grid' || search || activeGenre ? (
        <ShowGrid shows={filteredShows} onSelectShow={setSelectedShow} />
      ) : (
        <div className="space-y-8">
          {/* Most Popular (by episode count) */}
          {shows.length > 0 && (
            <ShowRail
              title="Most Popular"
              emoji="🔥"
              shows={shows.slice(0, 20)}
              onSelectShow={setSelectedShow}
              size="featured"
            />
          )}

          {/* Genre-based rails */}
          {genrePills.map((genre) => {
            const genreShows = showsByGenre.get(genre.id) || [];
            if (genreShows.length < 2) return null;
            return (
              <ShowRail
                key={genre.id}
                title={genre.label}
                emoji={genre.emoji}
                shows={genreShows.slice(0, 30)}
                onSelectShow={setSelectedShow}
              />
            );
          })}

          {/* Recently added (smaller shows that didn't make genre rails) */}
          {shows.length > 20 && (
            <ShowRail
              title="More Shows"
              emoji="📺"
              shows={shows.slice(20, 50)}
              onSelectShow={setSelectedShow}
              size="compact"
            />
          )}
        </div>
      )}

      {/* Pagination */}
      {totalSeries > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-full"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(totalSeries / ITEMS_PER_PAGE)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(totalSeries / ITEMS_PER_PAGE)}
            className="rounded-full"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
