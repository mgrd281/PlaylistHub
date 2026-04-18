'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlaylistItem } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoPlayerDialog } from '@/components/playlists/video-player-dialog';
import {
  Play, Search, Tv, X, ChevronRight, ChevronDown,
  Radio, Zap,
} from 'lucide-react';

/* ═══════════════════════════════════════════════
   Smart category classification
   ═══════════════════════════════════════════════ */

interface CategoryDef {
  key: string;
  label: string;
  emoji: string;
  patterns: RegExp;
}

const CATEGORY_DEFS: CategoryDef[] = [
  { key: 'sports',     label: 'Sports',          emoji: '⚽', patterns: /sport|bein|sky\s?sport|espn|dazn|fox\s?sport|eurosport|eleven|supersport|arena\s?sport/i },
  { key: 'news',       label: 'News',            emoji: '📰', patterns: /news|cnn|bbc|al\s?jazeera|sky\s?news|france\s?24|euronews|cnbc|bloomberg|rt\b|dw\b|trt\s?world/i },
  { key: 'kids',       label: 'Kids',            emoji: '🧸', patterns: /kid|cartoon|nickelodeon|nick\b|disney|baby|junior|tiji|gulli|boomerang|cneto|spacetoon|karusel/i },
  { key: 'movies',     label: 'Movies & Cinema', emoji: '🎬', patterns: /movie|cinema|film|hbo|showtime|starz|paramount|amc\b|tcm\b|cinemax/i },
  { key: 'music',      label: 'Music',           emoji: '🎵', patterns: /music|mtv|vh1|trace|melody|muzz|rotana\s?(music|clip)|radio/i },
  { key: 'documentary',label: 'Documentary',     emoji: '🌍', patterns: /document|discovery|nat\s?geo|national\s?geo|history|animal\s?planet|science|planet\s?earth|bbc\s?earth|love\s?nature/i },
  { key: 'arabic',     label: 'Arabic',          emoji: '🌙', patterns: /arab|mbc\b|rotana|lbc\b|ldc\b|al[\s-]|abu\s?dhabi|dubai|qatar|kuwait|oman|jordan|iraq|syria|lebanon|egypt|tunisia|morocco|algeria|libya|sudan|yemen|saudi|bahrain/i },
  { key: 'religious',  label: 'Religious',       emoji: '🕌', patterns: /relig|quran|islam|christian|church|gospel|prayer|bible|catholic|faith|iqra|kanal\s?7|trt\s?diyanet|huda/i },
  { key: 'turkish',    label: 'Turkish',         emoji: '🇹🇷', patterns: /turk|trt\b|kanal\s?d|star\s?tv|atv\b|show\s?tv|fox\s?tv.*tr|teve2|tv8|beyaz/i },
  { key: 'french',     label: 'French',          emoji: '🇫🇷', patterns: /franc|tf1|france\s?\d|m6\b|canal\+|arte|bfm|lci|rmc|c8\b|cstar|w9\b|nrj/i },
  { key: 'german',     label: 'German',          emoji: '🇩🇪', patterns: /german|deutsch|ard\b|zdf\b|rtl\b|sat\.?1|pro\s?7|vox\b|kabel|n-tv|ntv|welt|phoenix|3sat|arte.*de/i },
  { key: 'english',    label: 'English',         emoji: '🇬🇧', patterns: /\b(uk|british|england)\b|bbc\s?(one|two|three|four)|itv\b|channel\s?(4|5)|sky\s?(one|atlantic|cinema)|dave\b|e4\b/i },
  { key: 'spanish',    label: 'Spanish',         emoji: '🇪🇸', patterns: /spain|spanish|espanol|tve\b|antena\s?3|telecinco|la\s?sexta|cuatro\b|movistar|gol\b|barca/i },
  { key: 'indian',     label: 'Indian',          emoji: '🇮🇳', patterns: /india|hindi|tamil|telugu|star\s?(plus|gold|bharat)|zee\b|sony.*tv|colors|ndtv|aaj\s?tak/i },
  { key: 'entertainment', label: 'Entertainment', emoji: '🎭', patterns: /entertain|general|variety|comedy|drama|lifestyle|tlc|bravo|e!\b|fx\b/i },
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
  emoji: string;
  groups: { name: string; items: PlaylistItem[] }[];
  totalCount: number;
}

/* ═══════════════════════════════════════════════
   Channel Card — Compact, logo-forward
   ═══════════════════════════════════════════════ */

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

function ChannelCard({
  item,
  onPlay,
}: {
  item: PlaylistItem;
  onPlay: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const hasImage = item.tvg_logo && !error;

  return (
    <button
      type="button"
      onClick={onPlay}
      className="group flex items-center gap-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.04] hover:border-white/[0.1] px-3 py-2.5 transition-all duration-150 w-full text-left"
    >
      {/* Logo */}
      <div className="relative flex-shrink-0 h-10 w-10 rounded-lg overflow-hidden">
        {hasImage ? (
          <>
            <img
              src={item.tvg_logo!}
              alt=""
              loading="lazy"
              decoding="async"
              className={`h-full w-full object-contain bg-white/[0.05] p-0.5 transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
            {!loaded && <div className="absolute inset-0 bg-white/[0.05] animate-pulse rounded-lg" />}
          </>
        ) : (
          <div className={`h-full w-full flex items-center justify-center bg-gradient-to-br ${darkTone(item.name)} rounded-lg`}>
            <Tv className="h-4 w-4 text-white/25" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white/85 truncate leading-tight">{item.name}</p>
        {item.group_title && (
          <p className="text-[11px] text-white/30 truncate mt-0.5">{item.group_title}</p>
        )}
      </div>

      {/* Play indicator */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90">
          <Play className="h-3 w-3 text-black fill-black ml-0.5" />
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════
   Category Section — Collapsible group
   ═══════════════════════════════════════════════ */

function CategorySection({
  category,
  onPlay,
  defaultExpanded,
}: {
  category: MergedCategory;
  onPlay: (item: PlaylistItem) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeSubGroup, setActiveSubGroup] = useState<string | null>(null);
  const showSubGroups = category.groups.length > 1;

  const displayItems = useMemo(() => {
    if (activeSubGroup) {
      const g = category.groups.find((g) => g.name === activeSubGroup);
      return g ? g.items : [];
    }
    return category.groups.flatMap((g) => g.items);
  }, [category.groups, activeSubGroup]);

  // Show max 30 in collapsed inline preview
  const previewItems = displayItems.slice(0, 6);

  return (
    <div className="space-y-2">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full group/header"
      >
        <span className="text-lg select-none">{category.emoji}</span>
        <h2 className="text-[15px] font-semibold text-white/90 tracking-tight">{category.label}</h2>
        <span className="text-xs text-white/30 font-medium">{category.totalCount}</span>
        <div className="flex-1" />
        <ChevronDown
          className={`h-4 w-4 text-white/25 group-hover/header:text-white/50 transition-all duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
        />
      </button>

      {!expanded && (
        /* Collapsed: show a brief preview row */
        <div className="flex gap-2 overflow-hidden">
          {previewItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPlay(item)}
              className="group flex-shrink-0 flex items-center gap-2 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.04] hover:border-white/[0.08] px-2.5 py-1.5 transition-colors"
            >
              <div className="h-6 w-6 rounded overflow-hidden flex-shrink-0">
                {item.tvg_logo ? (
                  <img src={item.tvg_logo} alt="" loading="lazy" className="h-full w-full object-contain bg-white/[0.05] p-0.5" />
                ) : (
                  <div className={`h-full w-full flex items-center justify-center bg-gradient-to-br ${darkTone(item.name)}`}>
                    <Tv className="h-3 w-3 text-white/20" />
                  </div>
                )}
              </div>
              <span className="text-[11px] text-white/60 truncate max-w-[100px]">{item.name}</span>
            </button>
          ))}
          {displayItems.length > 6 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
            >
              +{displayItems.length - 6} more
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="space-y-2">
          {/* Sub-group filter pills */}
          {showSubGroups && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
              <button
                type="button"
                onClick={() => setActiveSubGroup(null)}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  !activeSubGroup ? 'bg-white/[0.12] text-white' : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60'
                }`}
              >
                All ({category.totalCount})
              </button>
              {category.groups.map((g) => (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => setActiveSubGroup(g.name)}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activeSubGroup === g.name ? 'bg-white/[0.12] text-white' : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60'
                  }`}
                >
                  {g.name} <span className="text-white/20 ml-1">{g.items.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* Channel grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
            {displayItems.map((item) => (
              <ChannelCard key={item.id} item={item} onPlay={() => onPlay(item)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main LiveTV Browser
   ═══════════════════════════════════════════════ */

export function LiveTVBrowser() {
  const [sections, setSections] = useState<GroupedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalChannels, setTotalChannels] = useState(0);
  const [playerItem, setPlayerItem] = useState<PlaylistItem | null>(null);
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch all channels grouped
  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      setLoading(true);
      const params = new URLSearchParams({ type: 'channel', mode: 'grouped' });
      if (debouncedSearch) params.set('search', debouncedSearch);

      try {
        const res = await fetch(`/api/browse?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setSections(data.sections || []);
          setTotalChannels(data.total || 0);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    fetch_();
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  // Merge raw group_titles into smart categories
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
        emoji: bucket.def?.emoji || '📺',
        groups,
        totalCount: total,
      });
    }

    return result.sort((a, b) => b.totalCount - a.totalCount);
  }, [sections]);

  // Filtered categories based on active sidebar selection
  const displayCategories = activeCategoryKey
    ? categories.filter((c) => c.key === activeCategoryKey)
    : categories;

  const scrollToCategory = (key: string) => {
    setActiveCategoryKey(key === activeCategoryKey ? null : key);
    const el = sectionRefs.current.get(key);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06]">
            <Tv className="h-4.5 w-4.5 text-white/60" />
          </div>
          <div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">Live TV</h1>
              {!loading && totalChannels > 0 && (
                <span className="text-sm font-medium text-white/40">{totalChannels.toLocaleString()} channels</span>
              )}
            </div>
            <p className="text-[13px] text-white/35 mt-0.5">Browse channels by category and network</p>
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <Input
          placeholder="Search channels, groups, networks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-white/[0.05] border-white/[0.08] text-white placeholder:text-white/30 h-9 focus:bg-white/[0.07] focus:border-white/[0.15]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Category quick-nav ── */}
      {!loading && categories.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          <button
            type="button"
            onClick={() => setActiveCategoryKey(null)}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
              !activeCategoryKey ? 'bg-white/[0.12] text-white' : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60'
            }`}
          >
            <Zap className="h-3 w-3" />
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => scrollToCategory(cat.key)}
              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                activeCategoryKey === cat.key
                  ? 'bg-white/[0.12] text-white'
                  : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60'
              }`}
            >
              <span className="text-[11px]">{cat.emoji}</span>
              {cat.label}
              <span className="text-white/20">{cat.totalCount}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-32 bg-white/[0.06] rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
                {Array.from({ length: 8 }).map((_, j) => (
                  <Skeleton key={j} className="h-[52px] rounded-lg bg-white/[0.04]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Category Sections ── */}
      {!loading && displayCategories.length > 0 && (
        <div className="space-y-6">
          {displayCategories.map((cat, i) => (
            <div
              key={cat.key}
              ref={(el) => { if (el) sectionRefs.current.set(cat.key, el); }}
            >
              <CategorySection
                category={cat}
                onPlay={(item) => setPlayerItem(item)}
                defaultExpanded={i < 3}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && categories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] mb-4">
            <Radio className="h-6 w-6 text-white/25" />
          </div>
          <p className="text-sm text-white/50 font-medium">
            {debouncedSearch
              ? 'No channels found. Try a different search term.'
              : 'No channels available. Add a playlist to get started.'}
          </p>
        </div>
      )}

      {/* ── Player ── */}
      {playerItem && (
        <VideoPlayerDialog item={playerItem} onClose={() => setPlayerItem(null)} />
      )}
    </div>
  );
}
