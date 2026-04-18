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

  if (layout === 'wide') {
    return (
      <button
        type="button"
        onClick={onPlay}
        className="group relative rounded-lg overflow-hidden aspect-video bg-neutral-800 transition-all duration-150 hover:ring-1 hover:ring-white/10"
      >
        {item.tvg_logo && !error ? (
          <>
            <img
              src={item.tvg_logo} alt="" loading="lazy" decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)} onError={() => setError(true)}
            />
            {!loaded && <div className="absolute inset-0 bg-neutral-800 animate-pulse" />}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="h-8 w-8 text-white/[0.06]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
            <Play className="h-4 w-4 text-black fill-black ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">{item.name}</p>
          {item.group_title && <p className="text-[9px] text-white/20 truncate mt-0.5">{item.group_title}</p>}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onPlay}
      className="group relative rounded-lg overflow-hidden aspect-[2/3] bg-neutral-800 transition-all duration-150 hover:ring-1 hover:ring-white/10"
    >
      {item.tvg_logo && !error ? (
        <>
          <img
            src={item.tvg_logo} alt="" loading="lazy" decoding="async"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)} onError={() => setError(true)}
          />
          {!loaded && <div className="absolute inset-0 bg-neutral-800 animate-pulse" />}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-7 w-7 text-white/[0.06]" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
          <Play className="h-4 w-4 text-black fill-black ml-0.5" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-[10px] font-medium text-white/80 leading-tight line-clamp-2">{item.name}</p>
        {item.group_title && <p className="text-[9px] text-white/20 truncate mt-0.5">{item.group_title}</p>}
      </div>
    </button>
  );
}

/* ─── Main Export ─── */

export function ContentBrowser({ contentType }: { contentType: 'channel' | 'movie' | 'series' }) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [playerItem, setPlayerItem] = useState<PlaylistItem | null>(null);
  const [layout, setLayout] = useState<'poster' | 'wide'>(contentType === 'channel' ? 'wide' : 'poster');
  const groupScrollRef = useRef<HTMLDivElement>(null);
  const limit = 60;

  const Icon = TYPE_ICON[contentType] || Layers;
  const label = TYPE_LABEL[contentType] || contentType;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeGroup]);

  // Fetch groups
  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch(`/api/browse?type=${contentType}&mode=groups`);
        if (!res.ok) return;
        const data = await res.json();
        setGroups(data.groups || []);
      } catch {}
    }
    fetchGroups();
  }, [contentType]);

  // Fetch items
  useEffect(() => {
    let cancelled = false;
    async function fetchItems() {
      setLoading(true);
      const params = new URLSearchParams({
        type: contentType,
        page: page.toString(),
        limit: limit.toString(),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (activeGroup) params.set('group', activeGroup);

      try {
        const res = await fetch(`/api/browse?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setItems(data.items || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 0);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    fetchItems();
    return () => { cancelled = true; };
  }, [contentType, page, limit, debouncedSearch, activeGroup]);

  const gridCols = layout === 'wide'
    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
    : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-white/40" />
          <h1 className="text-2xl font-bold text-white">{label}</h1>
          {total > 0 && !loading && (
            <span className="text-sm text-white/25">{total.toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
          <Input
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/[0.04] border-white/[0.06] text-white placeholder:text-white/25 h-9"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLayout('poster')}
            className={`h-8 w-8 rounded flex items-center justify-center transition-colors ${layout === 'poster' ? 'bg-white/[0.08] text-white' : 'text-white/30 hover:text-white/50'}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setLayout('wide')}
            className={`h-8 w-8 rounded flex items-center justify-center transition-colors ${layout === 'wide' ? 'bg-white/[0.08] text-white' : 'text-white/30 hover:text-white/50'}`}
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
              !activeGroup ? 'bg-white/[0.1] text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
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
                activeGroup === g.name ? 'bg-white/[0.1] text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
              }`}
            >
              {g.name}
              <span className="ml-1.5 text-white/20">{g.count}</span>
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
              className={`${layout === 'wide' ? 'aspect-video' : 'aspect-[2/3]'} rounded-lg bg-white/[0.04]`}
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
          <Icon className="h-10 w-10 text-white/[0.06] mb-3" />
          <p className="text-sm text-white/40">
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
        <VideoPlayerDialog item={playerItem} onClose={() => setPlayerItem(null)} />
      )}
    </div>
  );
}
