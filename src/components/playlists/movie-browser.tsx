'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlaylistItem } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Search, Film, Play, Star, ChevronLeft, ChevronRight,
  Loader2, SlidersHorizontal, Grid3X3, LayoutList, X,
} from 'lucide-react';

/* ════════════════════════════════════════════════════
   Genre Classifier for Movies
   ════════════════════════════════════════════════════ */

interface GenreDef {
  id: string;
  label: string;
  emoji: string;
  test: (text: string) => boolean;
}

const GENRES: GenreDef[] = [
  { id: 'action', label: 'Action', emoji: '💥', test: (t) => /action|fight|war|battle|martial|combat|mission|strike/i.test(t) },
  { id: 'comedy', label: 'Comedy', emoji: '😂', test: (t) => /comedy|comic|funny|laugh|humor|satire/i.test(t) },
  { id: 'drama', label: 'Drama', emoji: '🎭', test: (t) => /drama|dramatic/i.test(t) },
  { id: 'horror', label: 'Horror', emoji: '👻', test: (t) => /horror|scary|zombie|ghost|haunted|evil|terror|fear/i.test(t) },
  { id: 'scifi', label: 'Sci-Fi', emoji: '🚀', test: (t) => /sci.?fi|science fiction|space|alien|future|cyber|robot|galaxy/i.test(t) },
  { id: 'romance', label: 'Romance', emoji: '💕', test: (t) => /romance|romantic|love story|wedding|heart/i.test(t) },
  { id: 'thriller', label: 'Thriller', emoji: '🔪', test: (t) => /thriller|suspense|mystery|detective|crime|murder|killer/i.test(t) },
  { id: 'animation', label: 'Animation', emoji: '🎨', test: (t) => /animat|cartoon|pixar|disney|anime|manga|dreamworks/i.test(t) },
  { id: 'documentary', label: 'Documentary', emoji: '📹', test: (t) => /document|docu|bbc|national geographic/i.test(t) },
  { id: 'family', label: 'Family', emoji: '👨‍👩‍👧‍👦', test: (t) => /family|kids|child|junior|christmas/i.test(t) },
  { id: 'arabic', label: 'Arabic', emoji: '🌙', test: (t) => /arab|مصر|عرب|aflam|arabi|egyptian|turk|hindi|bollywood|indian/i.test(t) },
];

function classifyMovie(name: string, group: string): string {
  const text = `${group} ${name}`;
  for (const genre of GENRES) {
    if (genre.test(text)) return genre.id;
  }
  return 'all';
}

/* ════════════════════════════════════════════════════
   Extract year from movie name (e.g. "Movie Name 2024")
   ════════════════════════════════════════════════════ */

function extractYear(name: string): string | null {
  const match = name.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

/* ════════════════════════════════════════════════════
   Movie Poster Card — Premium Design
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

const MovieCard = memo(function MovieCard({
  item,
  onSelect,
  size = 'normal',
}: {
  item: PlaylistItem;
  onSelect: () => void;
  size?: 'normal' | 'featured' | 'compact';
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const year = extractYear(item.name);
  const gradient = getGradient(item.name);

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
      {item.tvg_logo && !imgError ? (
        <>
          <img
            src={item.tvg_logo}
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
            <Film className="h-10 w-10 text-white/20" />
          </div>
          {/* Decorative film reel pattern */}
          <div className="absolute top-3 left-3 right-3 flex gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full bg-white/10" />
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

      {/* Year badge */}
      {year && (
        <div className="absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
          {year}
        </div>
      )}

      {/* Title area */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className={`font-semibold text-white leading-tight line-clamp-2 ${size === 'featured' ? 'text-sm' : 'text-xs'}`}>
          {item.name.replace(/\s*\(\d{4}\)\s*$/, '').replace(/\s*\d{4}\s*$/, '')}
        </p>
        {item.group_title && (
          <p className="mt-0.5 text-[10px] text-white/50 truncate">{item.group_title}</p>
        )}
      </div>
    </button>
  );
});

/* ════════════════════════════════════════════════════
   Movie Rail — Horizontal Scroll Row
   ════════════════════════════════════════════════════ */

function MovieRail({
  title,
  emoji,
  movies,
  onSelectItem,
  size = 'normal',
}: {
  title: string;
  emoji?: string;
  movies: PlaylistItem[];
  onSelectItem: (item: PlaylistItem) => void;
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
  }, [updateScrollState, movies]);

  function scroll(dir: 'left' | 'right') {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  if (movies.length === 0) return null;

  return (
    <div className="group/rail space-y-3">
      {/* Rail header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
          {emoji && <span className="text-lg">{emoji}</span>}
          {title}
          <span className="text-xs font-normal text-muted-foreground ml-1">
            {movies.length}
          </span>
        </h3>
        <div className="flex gap-1 opacity-0 group-hover/rail:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-none scroll-smooth pb-2 -mx-1 px-1"
      >
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            item={movie}
            size={size}
            onSelect={() => onSelectItem(movie)}
          />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Grid View for All Movies
   ════════════════════════════════════════════════════ */

function MovieGrid({
  movies,
  onSelectItem,
  loading,
}: {
  movies: PlaylistItem[];
  onSelectItem: (item: PlaylistItem) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
        {Array.from({ length: 21 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
        ))}
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20">
        <div className="rounded-full bg-muted p-4 mb-3">
          <Film className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground font-medium">No movies found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
      {movies.map((movie) => (
        <MovieCard
          key={movie.id}
          item={movie}
          size="normal"
          onSelect={() => onSelectItem(movie)}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Hero Featured Movie
   ════════════════════════════════════════════════════ */

function HeroMovie({
  movie,
  onSelect,
}: {
  movie: PlaylistItem;
  onSelect: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const gradient = getGradient(movie.name);
  const year = extractYear(movie.name);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative w-full rounded-2xl overflow-hidden h-[280px] sm:h-[320px] transition-all duration-500 hover:shadow-2xl hover:shadow-black/20"
    >
      {/* Background */}
      {movie.tvg_logo ? (
        <>
          <img
            src={movie.tvg_logo}
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

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
          <span className="text-xs font-medium text-amber-400">Featured</span>
          {year && (
            <span className="text-xs text-white/60 ml-2">{year}</span>
          )}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight line-clamp-2 max-w-lg">
          {movie.name}
        </h2>
        {movie.group_title && (
          <p className="text-sm text-white/50 mt-1">{movie.group_title}</p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg transition-transform group-hover:scale-105">
            <Play className="h-4 w-4 fill-current" />
            Play Now
          </div>
        </div>
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════
   Main Movie Browser Component
   ════════════════════════════════════════════════════ */

export function MovieBrowser({
  playlistId,
  totalMovies,
  onSelectItem,
}: {
  playlistId: string;
  totalMovies: number;
  onSelectItem: (item: PlaylistItem) => void;
}) {
  const [allMovies, setAllMovies] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'browse' | 'grid'>('browse');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 500;

  // Fetch all movies
  useEffect(() => {
    let cancelled = false;

    async function fetchMovies() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          type: 'movie',
          limit: ITEMS_PER_PAGE.toString(),
          page: page.toString(),
        });
        const res = await fetch(`/api/playlists/${playlistId}/items?${params}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled) {
          setAllMovies(data.items || []);
        }
      } catch {
        if (!cancelled) setAllMovies([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMovies();
    return () => { cancelled = true; };
  }, [playlistId, page]);

  // Group movies by genre
  const grouped = useMemo(() => {
    const map = new Map<string, PlaylistItem[]>();

    for (const movie of allMovies) {
      const genre = classifyMovie(movie.name, movie.group_title || '');
      if (!map.has(genre)) map.set(genre, []);
      map.get(genre)!.push(movie);
    }

    // Also group by group_title (provider categories)
    const byGroup = new Map<string, PlaylistItem[]>();
    for (const movie of allMovies) {
      const group = movie.group_title || 'Uncategorized';
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group)!.push(movie);
    }

    return { byGenre: map, byGroup };
  }, [allMovies]);

  // Filtered movies (search + genre)
  const filteredMovies = useMemo(() => {
    let movies = allMovies;

    if (activeGenre) {
      if (grouped.byGenre.has(activeGenre)) {
        movies = grouped.byGenre.get(activeGenre)!;
      } else if (grouped.byGroup.has(activeGenre)) {
        movies = grouped.byGroup.get(activeGenre)!;
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      movies = movies.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.group_title?.toLowerCase().includes(q)
      );
    }

    return movies;
  }, [allMovies, search, activeGenre, grouped]);

  // Pick a featured movie (has poster image, random-ish)
  const featuredMovie = useMemo(() => {
    const withPoster = allMovies.filter((m) => m.tvg_logo);
    if (withPoster.length === 0) return allMovies[0] || null;
    // Deterministic pick based on date so it changes daily
    const dayHash = new Date().getDate();
    return withPoster[dayHash % withPoster.length];
  }, [allMovies]);

  // Top group-title categories sorted by count
  const topGroups = useMemo(() => {
    return Array.from(grouped.byGroup.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 15);
  }, [grouped.byGroup]);

  // Active genre pills
  const genrePills = useMemo(() => {
    return GENRES.filter((g) => grouped.byGenre.has(g.id) && grouped.byGenre.get(g.id)!.length > 0);
  }, [grouped.byGenre]);

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
      {/* Hero Section — only in browse mode without search */}
      {viewMode === 'browse' && !search && !activeGenre && featuredMovie && (
        <HeroMovie movie={featuredMovie} onSelect={() => onSelectItem(featuredMovie)} />
      )}

      {/* Search & Controls Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search movies..."
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
            {filteredMovies.length.toLocaleString()} movies
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
        /* Grid view — flat display */
        <MovieGrid
          movies={filteredMovies}
          onSelectItem={onSelectItem}
          loading={false}
        />
      ) : (
        /* Browse view — rails by category */
        <div className="space-y-8">
          {/* Recently added (first 20 items) */}
          {allMovies.length > 0 && (
            <MovieRail
              title="Recently Added"
              emoji="🆕"
              movies={allMovies.slice(0, 20)}
              onSelectItem={onSelectItem}
              size="featured"
            />
          )}

          {/* Genre-based rails */}
          {genrePills.map((genre) => {
            const movies = grouped.byGenre.get(genre.id) || [];
            if (movies.length < 3) return null;
            return (
              <MovieRail
                key={genre.id}
                title={genre.label}
                emoji={genre.emoji}
                movies={movies.slice(0, 30)}
                onSelectItem={onSelectItem}
              />
            );
          })}

          {/* Provider category rails */}
          {topGroups.map(([groupName, movies]) => {
            if (movies.length < 3) return null;
            return (
              <MovieRail
                key={groupName}
                title={groupName}
                movies={movies.slice(0, 30)}
                onSelectItem={onSelectItem}
                size="compact"
              />
            );
          })}
        </div>
      )}

      {/* Pagination for large libraries */}
      {totalMovies > ITEMS_PER_PAGE && (
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
            Page {page} of {Math.ceil(totalMovies / ITEMS_PER_PAGE)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(totalMovies / ITEMS_PER_PAGE)}
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
