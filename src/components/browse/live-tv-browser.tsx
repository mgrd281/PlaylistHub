'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { PlaylistItem } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoPlayerDialog } from '@/components/playlists/video-player-dialog';
import {
  Play, Search, Tv, X, ChevronLeft,
  Radio, Hash, Layers,
} from 'lucide-react';

/* ═══════════════════════════════════════════════
   Smart category classification
   ═══════════════════════════════════════════════ */

interface CategoryDef {
  key: string;
  label: string;
  icon: string;
  patterns: RegExp;
}

const CATEGORY_DEFS: CategoryDef[] = [
  { key: 'sports',        label: 'Sports',          icon: '⚽', patterns: /sport|bein|sky\s?sport|espn|dazn|fox\s?sport|eurosport|eleven|supersport|arena\s?sport/i },
  { key: 'news',          label: 'News',            icon: '📰', patterns: /news|cnn|bbc|al\s?jazeera|sky\s?news|france\s?24|euronews|cnbc|bloomberg|rt\b|dw\b|trt\s?world/i },
  { key: 'kids',          label: 'Kids',            icon: '🧸', patterns: /kid|cartoon|nickelodeon|nick\b|disney|baby|junior|tiji|gulli|boomerang|cneto|spacetoon|karusel/i },
  { key: 'movies',        label: 'Cinema',          icon: '🎬', patterns: /movie|cinema|film|hbo|showtime|starz|paramount|amc\b|tcm\b|cinemax/i },
  { key: 'music',         label: 'Music',           icon: '🎵', patterns: /music|mtv|vh1|trace|melody|muzz|rotana\s?(music|clip)|radio/i },
  { key: 'documentary',   label: 'Documentary',     icon: '🌍', patterns: /document|discovery|nat\s?geo|national\s?geo|history|animal\s?planet|science|planet\s?earth|bbc\s?earth|love\s?nature/i },
  { key: 'arabic',        label: 'Arabic',          icon: '🌙', patterns: /arab|mbc\b|rotana|lbc\b|ldc\b|al[\s-]|abu\s?dhabi|dubai|qatar|kuwait|oman|jordan|iraq|syria|lebanon|egypt|tunisia|morocco|algeria|libya|sudan|yemen|saudi|bahrain/i },
  { key: 'religious',     label: 'Religious',       icon: '🕌', patterns: /relig|quran|islam|christian|church|gospel|prayer|bible|catholic|faith|iqra|kanal\s?7|trt\s?diyanet|huda/i },
  { key: 'turkish',       label: 'Turkish',         icon: '🇹🇷', patterns: /turk|trt\b|kanal\s?d|star\s?tv|atv\b|show\s?tv|fox\s?tv.*tr|teve2|tv8|beyaz/i },
  { key: 'french',        label: 'French',          icon: '🇫🇷', patterns: /franc|tf1|france\s?\d|m6\b|canal\+|arte|bfm|lci|rmc|c8\b|cstar|w9\b|nrj/i },
  { key: 'german',        label: 'German',          icon: '🇩🇪', patterns: /german|deutsch|ard\b|zdf\b|rtl\b|sat\.?1|pro\s?7|vox\b|kabel|n-tv|ntv|welt|phoenix|3sat|arte.*de/i },
  { key: 'english',       label: 'English',         icon: '🇬🇧', patterns: /\b(uk|british|england)\b|bbc\s?(one|two|three|four)|itv\b|channel\s?(4|5)|sky\s?(one|atlantic|cinema)|dave\b|e4\b/i },
  { key: 'spanish',       label: 'Spanish',         icon: '🇪🇸', patterns: /spain|spanish|espanol|tve\b|antena\s?3|telecinco|la\s?sexta|cuatro\b|movistar|gol\b|barca/i },
  { key: 'indian',        label: 'Indian',          icon: '🇮🇳', patterns: /india|hindi|tamil|telugu|star\s?(plus|gold|bharat)|zee\b|sony.*tv|colors|ndtv|aaj\s?tak/i },
  { key: 'entertainment', label: 'Entertainment',   icon: '🎭', patterns: /entertain|general|variety|comedy|drama|lifestyle|tlc|bravo|e!\b|fx\b/i },
];

function classifyGroup(groupName: string): string {
  for (const def of CATEGORY_DEFS) {
    if (def.patterns.test(groupName)) return def.key;
  }
  return 'other';
}

interface GroupedSection {
  name: string;
  items: PlaylistItem[];
  count: number;
}

interface MergedCategory {
  key: string;
  label: string;
  icon: string;
  groups: { name: string; items: PlaylistItem[] }[];
  totalCount: number;
}

/* ═══════════════════════════════════════════════
   Stable color generation for fallback logos
   ═══════════════════════════════════════════════ */

const GRADIENT_PAIRS = [
  'from-blue-600/80 to-blue-800/80',
  'from-violet-600/80 to-violet-800/80',
  'from-emerald-600/80 to-emerald-800/80',
  'from-amber-600/80 to-amber-800/80',
  'from-rose-600/80 to-rose-800/80',
  'from-cyan-600/80 to-cyan-800/80',
  'from-indigo-600/80 to-indigo-800/80',
  'from-pink-600/80 to-pink-800/80',
];

function stableGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return GRADIENT_PAIRS[Math.abs(h) % GRADIENT_PAIRS.length];
}

/* ═══════════════════════════════════════════════
   Compact Channel Row — optimized for mobile
   ═══════════════════════════════════════════════ */

function ChannelRow({
  item,
  onPlay,
  isActive,
}: {
  item: PlaylistItem;
  onPlay: () => void;
  isActive: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const hasImage = item.tvg_logo && !error;

  return (
    <button
      type="button"
      onClick={onPlay}
      className={`group flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.98] ${
        isActive
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'bg-card/60 hover:bg-card active:bg-card/80'
      }`}
    >
      {/* Logo */}
      <div className={`relative flex-shrink-0 h-9 w-9 rounded-lg overflow-hidden ring-1 ${
        isActive ? 'ring-primary/30' : 'ring-border/30'
      }`}>
        {hasImage ? (
          <>
            <img
              src={item.tvg_logo!}
              alt=""
              loading="lazy"
              decoding="async"
              className={`h-full w-full object-contain bg-muted/50 p-0.5 transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
            {!loaded && <div className="absolute inset-0 bg-muted animate-pulse" />}
          </>
        ) : (
          <div className={`h-full w-full flex items-center justify-center bg-gradient-to-br ${stableGradient(item.name)}`}>
            <span className="text-[10px] font-bold text-white/60">{item.name.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-medium truncate leading-tight ${
          isActive ? 'text-primary' : 'text-foreground/85'
        }`}>{item.name}</p>
      </div>

      {/* Play indicator */}
      {isActive ? (
        <div className="flex-shrink-0">
          <div className="flex items-center gap-0.5">
            <span className="block w-[3px] h-3 bg-primary rounded-full animate-pulse" />
            <span className="block w-[3px] h-4 bg-primary rounded-full animate-pulse [animation-delay:150ms]" />
            <span className="block w-[3px] h-2.5 bg-primary rounded-full animate-pulse [animation-delay:300ms]" />
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 sm:transition-opacity">
          <Play className="h-3.5 w-3.5 text-muted-foreground fill-muted-foreground" />
        </div>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════
   Category Tile — for the grid overview
   ═══════════════════════════════════════════════ */

function CategoryTile({
  category,
  onSelect,
}: {
  category: MergedCategory;
  onSelect: () => void;
}) {
  const previewLogos = useMemo(() => {
    const logos: string[] = [];
    for (const g of category.groups) {
      for (const item of g.items) {
        if (item.tvg_logo && logos.length < 4) logos.push(item.tvg_logo);
        if (logos.length >= 4) break;
      }
      if (logos.length >= 4) break;
    }
    return logos;
  }, [category.groups]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex flex-col rounded-2xl bg-card border border-border/50 hover:border-border p-4 text-left transition-all duration-200 active:scale-[0.97] overflow-hidden"
    >
      {/* Top: icon + count */}
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl select-none">{category.icon}</span>
        <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
          {category.totalCount}
        </span>
      </div>

      {/* Label */}
      <h3 className="text-[15px] font-semibold text-foreground tracking-tight leading-tight mb-1">
        {category.label}
      </h3>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {category.groups.length} {category.groups.length === 1 ? 'group' : 'groups'}
      </p>

      {/* Preview logos row */}
      {previewLogos.length > 0 && (
        <div className="flex items-center gap-1 mt-3 -mb-0.5">
          {previewLogos.map((logo, i) => (
            <div key={i} className="h-6 w-6 rounded-md overflow-hidden ring-1 ring-border/20 bg-muted/50 flex-shrink-0">
              <img src={logo} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" />
            </div>
          ))}
          {category.totalCount > 4 && (
            <span className="text-[10px] text-muted-foreground/60 ml-1">+{category.totalCount - 4}</span>
          )}
        </div>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════
   Channel List View — shown after selecting a category
   ═══════════════════════════════════════════════ */

function ChannelListView({
  category,
  allChannels,
  onBack,
  onPlay,
  activeItemId,
}: {
  category: MergedCategory;
  allChannels: PlaylistItem[];
  onBack: () => void;
  onPlay: (item: PlaylistItem, channelList: PlaylistItem[]) => void;
  activeItemId: string | null;
}) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [channelSearch, setChannelSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showGroups = category.groups.length > 1;

  const displayItems = useMemo(() => {
    let items: PlaylistItem[];
    if (activeGroup) {
      const g = category.groups.find((g) => g.name === activeGroup);
      items = g ? g.items : [];
    } else {
      items = category.groups.flatMap((g) => g.items);
    }
    if (channelSearch.trim()) {
      const q = channelSearch.toLowerCase();
      items = items.filter(
        (ch) => ch.name.toLowerCase().includes(q) || ch.group_title?.toLowerCase().includes(q),
      );
    }
    return items;
  }, [category.groups, activeGroup, channelSearch]);

  // Scroll to top when group changes
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [activeGroup]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/40 -mx-4 px-4 lg:-mx-6 lg:px-6 -mt-4 lg:-mt-5 pt-4 lg:pt-5 pb-3 space-y-3">
        {/* Row 1: back + title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted/60 hover:bg-muted text-foreground/60 hover:text-foreground transition-colors active:scale-95 flex-shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg select-none">{category.icon}</span>
              <h2 className="text-lg font-bold text-foreground tracking-tight truncate">{category.label}</h2>
              <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
                {displayItems.length}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <input
            ref={inputRef}
            type="text"
            placeholder={`Search in ${category.label}...`}
            value={channelSearch}
            onChange={(e) => setChannelSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-9 rounded-xl bg-muted/50 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-border/60 transition-all"
          />
          {channelSearch && (
            <button
              onClick={() => { setChannelSearch(''); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Row 3: sub-group pills */}
        {showGroups && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 lg:-mx-6 lg:px-6 pb-0.5">
            <button
              type="button"
              onClick={() => setActiveGroup(null)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
                !activeGroup
                  ? 'bg-foreground text-background shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              All
            </button>
            {category.groups.map((g) => (
              <button
                key={g.name}
                type="button"
                onClick={() => setActiveGroup(activeGroup === g.name ? null : g.name)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
                  activeGroup === g.name
                    ? 'bg-foreground text-background shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {g.name}
                <span className={`ml-1.5 ${activeGroup === g.name ? 'text-background/50' : 'text-muted-foreground/40'}`}>
                  {g.items.length}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Channel list ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto pt-3 -mx-1">
        {displayItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 px-1">
            {displayItems.map((item) => (
              <ChannelRow
                key={item.id}
                item={item}
                onPlay={() => onPlay(item, displayItems)}
                isActive={item.id === activeItemId}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-8 w-8 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No channels found</p>
            {channelSearch && (
              <button
                onClick={() => setChannelSearch('')}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main LiveTV Browser — 2-phase navigation
   ═══════════════════════════════════════════════ */

export function LiveTVBrowser() {
  const [sections, setSections] = useState<GroupedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalChannels, setTotalChannels] = useState(0);
  const [playerItem, setPlayerItem] = useState<PlaylistItem | null>(null);
  const [playerChannelList, setPlayerChannelList] = useState<PlaylistItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(globalSearch), 250);
    return () => clearTimeout(t);
  }, [globalSearch]);

  // Fetch all channels grouped (once on mount — search is client-side)
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      const params = new URLSearchParams({ type: 'channel', mode: 'grouped' });
      try {
        const res = await fetch(`/api/browse?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setSections(data.sections || []);
          setTotalChannels(data.total || 0);
        }
      } catch { /* network error */ }
      if (!cancelled) setLoading(false);
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  // Build categories from raw group_title sections
  const categories = useMemo<MergedCategory[]>(() => {
    const buckets = new Map<string, { groups: Map<string, PlaylistItem[]>; def: CategoryDef | null }>();

    for (const section of sections) {
      const catKey = classifyGroup(section.name);
      if (!buckets.has(catKey)) {
        buckets.set(catKey, {
          groups: new Map(),
          def: CATEGORY_DEFS.find((d) => d.key === catKey) || null,
        });
      }
      const bucket = buckets.get(catKey)!;
      const existing = bucket.groups.get(section.name) || [];
      bucket.groups.set(section.name, [...existing, ...section.items]);
    }

    const result: MergedCategory[] = [];
    for (const [key, bucket] of buckets.entries()) {
      const groups = Array.from(bucket.groups.entries())
        .map(([name, items]) => ({ name, items }))
        .sort((a, b) => b.items.length - a.items.length);
      const total = groups.reduce((s, g) => s + g.items.length, 0);
      result.push({
        key,
        label: bucket.def?.label || 'Other',
        icon: bucket.def?.icon || '📺',
        groups,
        totalCount: total,
      });
    }

    return result.sort((a, b) => b.totalCount - a.totalCount);
  }, [sections]);

  // Flat channel list for global search
  const allChannels = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Global search results (client-side — instant, no API calls)
  const searchResults = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    const q = debouncedSearch.toLowerCase();
    return allChannels.filter(
      (ch) => ch.name.toLowerCase().includes(q) || ch.group_title?.toLowerCase().includes(q),
    );
  }, [allChannels, debouncedSearch]);

  const isSearching = debouncedSearch.trim().length > 0;

  // Currently viewed category object
  const activeCategoryObj = activeCategory
    ? categories.find((c) => c.key === activeCategory) || null
    : null;

  const handlePlay = useCallback((item: PlaylistItem, channelList: PlaylistItem[]) => {
    setPlayerItem(item);
    setPlayerChannelList(channelList);
  }, []);

  const handleNavigate = useCallback((item: PlaylistItem) => {
    setPlayerItem(item);
  }, []);

  /* ── Render: Category Channel List view ── */
  if (activeCategoryObj && !isSearching) {
    return (
      <>
        <ChannelListView
          category={activeCategoryObj}
          allChannels={allChannels}
          onBack={() => setActiveCategory(null)}
          onPlay={handlePlay}
          activeItemId={playerItem?.id ?? null}
        />
        {playerItem && (
          <VideoPlayerDialog
            item={playerItem}
            channelList={playerChannelList}
            onClose={() => setPlayerItem(null)}
            onNavigate={handleNavigate}
          />
        )}
      </>
    );
  }

  /* ── Render: Home / category overview + global search ── */
  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Tv className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Live TV</h1>
          {!loading && totalChannels > 0 && (
            <p className="text-[12px] text-muted-foreground">
              {totalChannels.toLocaleString()} channels &middot; {categories.length} categories
            </p>
          )}
        </div>
      </div>

      {/* ── Global Search ── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search all channels..."
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-10 rounded-2xl bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-border focus:bg-muted/70 transition-all"
        />
        {globalSearch && (
          <button
            onClick={() => { setGlobalSearch(''); searchInputRef.current?.focus(); }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[130px] rounded-2xl bg-muted/40" />
          ))}
        </div>
      )}

      {/* ── Global search results ── */}
      {!loading && isSearching && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground/70">
              {searchResults.length} {searchResults.length === 1 ? 'channel' : 'channels'} found
            </span>
          </div>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
              {searchResults.slice(0, 100).map((item) => (
                <ChannelRow
                  key={item.id}
                  item={item}
                  onPlay={() => handlePlay(item, searchResults)}
                  isActive={item.id === playerItem?.id}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-8 w-8 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No channels match &ldquo;{debouncedSearch}&rdquo;</p>
            </div>
          )}
        </div>
      )}

      {/* ── Category Grid (home state) ── */}
      {!loading && !isSearching && categories.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground/60 uppercase tracking-wider">Categories</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {categories.map((cat) => (
              <CategoryTile
                key={cat.key}
                category={cat}
                onSelect={() => setActiveCategory(cat.key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !isSearching && categories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <Radio className="h-6 w-6 text-muted-foreground/30" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            No channels available. Add a playlist to get started.
          </p>
        </div>
      )}

      {/* ── Player ── */}
      {playerItem && !activeCategoryObj && (
        <VideoPlayerDialog
          item={playerItem}
          channelList={playerChannelList}
          onClose={() => setPlayerItem(null)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}
