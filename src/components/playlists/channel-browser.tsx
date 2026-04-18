'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlaylistItem } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Search, Radio, Play, ChevronRight, ChevronDown,
  Trophy, Newspaper, Baby, Music2, BookOpen, Tv, Sparkles,
  Globe, Heart, Clapperboard, FolderOpen, Loader2,
} from 'lucide-react';

/* ════════════════════════════════════════════════════
   Super-Category Classifier
   ════════════════════════════════════════════════════ */

type ChannelFamily =
  | 'sports' | 'news' | 'kids' | 'music' | 'religious'
  | 'documentary' | 'cinema' | 'entertainment' | 'general';

interface FamilyDef {
  id: ChannelFamily;
  label: string;
  icon: React.ElementType;
  color: string;
  test: (text: string) => boolean;
}

const FAMILIES: FamilyDef[] = [
  {
    id: 'sports',
    label: 'Sports',
    icon: Trophy,
    color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800',
    test: (t) => /sport|bein|espn|dazn|eurosport|supersport|arena sport|eleven sport|nfl|nba |mlb |nhl |sky sport|bt sport|fox sport|la liga|premier league|bundesliga|serie a|ligue 1|football|soccer|tennis|golf|cricket|rugby|formula|racing|boxing|wrestling|ufc|fight|motogp|olympi|ssc |ksa sport|abu dhabi sport|dubai sport/i.test(t),
  },
  {
    id: 'news',
    label: 'News',
    icon: Newspaper,
    color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800',
    test: (t) => /\bnews\b|cnbc|cnn |bbc news|jazeera|france 24|euronews|bloomberg|sky news|fox news|arabiya|echorouk|ennahar|bilad|rt arab|ntv |welt|tagesschau|n24|dw |i24|ctv news/i.test(t),
  },
  {
    id: 'kids',
    label: 'Kids',
    icon: Baby,
    color: 'text-pink-600 bg-pink-50 border-pink-200 dark:text-pink-400 dark:bg-pink-950 dark:border-pink-800',
    test: (t) => /\bkid|cartoon|nick|disney|junior|baby tv|child|cbbc|cbeeb|boomerang|toon|spacetoon|mbc ?3|cartoon network|karameesh|toyor|baraem|ajyal/i.test(t),
  },
  {
    id: 'music',
    label: 'Music',
    icon: Music2,
    color: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950 dark:border-violet-800',
    test: (t) => /\bmusic\b|mtv |vh1|rotana music|vevo|trace |melody|mazzika|nogoum|mbc max/i.test(t),
  },
  {
    id: 'religious',
    label: 'Religious',
    icon: Heart,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800',
    test: (t) => /quran|islam|christian|church|bible|iqraa|majd|huda|sunnah|catholic|prayer|religious|ramadan|karim|men in islam|god tv|tbn|daystar|ctv faith/i.test(t),
  },
  {
    id: 'documentary',
    label: 'Docs',
    icon: BookOpen,
    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800',
    test: (t) => /document|nat geo|discovery|history ch|animal planet|science ch|geographic|bbc earth|travel ch|dw doc|vice/i.test(t),
  },
  {
    id: 'cinema',
    label: 'Cinema',
    icon: Clapperboard,
    color: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800',
    test: (t) => /cinema|movie ch|film ch|osn movie|mbc ?2 |mbc ?4 |hbo |showtime|starz|action ch|paramount|amc |tcm |fox movie/i.test(t),
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    icon: Sparkles,
    color: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950 dark:border-orange-800',
    test: (t) => /entertain|lifestyle|cooking|food ch|fashion|reality|drama|mbc ?1|mbc drama|rotana|lbc|one tv|osn |fatafeat|tlc |e! |bravo/i.test(t),
  },
  {
    id: 'general',
    label: 'General',
    icon: Tv,
    color: 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900 dark:border-gray-700',
    test: () => true,
  },
];

const FAMILY_MAP = new Map(FAMILIES.map((f) => [f.id, f]));

function classifyGroup(
  groupName: string,
  sampleNames: string[],
): ChannelFamily {
  const text = `${groupName} ${sampleNames.join(' ')}`;
  for (const fam of FAMILIES) {
    if (fam.id !== 'general' && fam.test(text)) return fam.id;
  }
  return 'general';
}

/* ════════════════════════════════════════════════════
   Memoized Channel Card
   ════════════════════════════════════════════════════ */

const ChannelCard = memo(function ChannelCard({
  item,
  onSelect,
}: {
  item: PlaylistItem;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex items-center gap-3 rounded-xl border bg-card p-2.5 text-left transition-all hover:bg-accent/50 hover:border-foreground/15 hover:shadow-sm active:scale-[0.98]"
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 overflow-hidden ring-1 ring-foreground/5">
        {item.tvg_logo ? (
          <img
            src={item.tvg_logo}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain p-0.5"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = 'none';
              const sib = el.nextElementSibling;
              if (sib) (sib as HTMLElement).classList.remove('hidden');
            }}
          />
        ) : null}
        <div
          className={`flex items-center justify-center ${item.tvg_logo ? 'hidden' : ''}`}
        >
          <Radio className="h-4 w-4 text-muted-foreground/50" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium leading-snug">{item.name}</p>
      </div>

      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Play className="h-3 w-3 fill-current" />
        </div>
      </div>
    </button>
  );
});

/* ════════════════════════════════════════════════════
   Group Section
   ════════════════════════════════════════════════════ */

interface GroupInfo {
  name: string;
  count: number;
  samples: string[];
  family: ChannelFamily;
}

function GroupSection({
  group,
  isExpanded,
  items,
  isLoading,
  onToggle,
  onSelectItem,
}: {
  group: GroupInfo;
  isExpanded: boolean;
  items: PlaylistItem[] | undefined;
  isLoading: boolean;
  onToggle: () => void;
  onSelectItem: (item: PlaylistItem) => void;
}) {
  const fam = FAMILY_MAP.get(group.family);
  const FamIcon = fam?.icon || Tv;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Group header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-3 w-full p-3 hover:bg-accent/30 transition-colors text-left"
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${fam?.color || ''}`}
        >
          <FamIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {group.name || 'Ungrouped'}
          </p>
          <p className="text-xs text-muted-foreground">
            {group.count.toLocaleString()} channel{group.count !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded channel list */}
      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[52px] rounded-xl" />
              ))}
            </div>
          ) : items && items.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ChannelCard
                  key={item.id}
                  item={item}
                  onSelect={() => onSelectItem(item)}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No channels loaded
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Main Channel Browser
   ════════════════════════════════════════════════════ */

interface ChannelBrowserProps {
  playlistId: string;
  totalChannels: number;
  onSelectItem: (item: PlaylistItem) => void;
}

export function ChannelBrowser({
  playlistId,
  totalChannels,
  onSelectItem,
}: ChannelBrowserProps) {
  /* ── State ── */
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [selectedFamily, setSelectedFamily] = useState<ChannelFamily | 'all'>(
    'all',
  );
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [groupItems, setGroupItems] = useState<
    Record<string, PlaylistItem[]>
  >({});
  const [groupItemsLoading, setGroupItemsLoading] = useState<string | null>(
    null,
  );

  // Search
  const [search, setSearch] = useState('');
  const [searchItems, setSearchItems] = useState<PlaylistItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Show more groups
  const [showAllGroups, setShowAllGroups] = useState(false);

  const isSearching = search.length > 1;

  /* ── Fetch groups ── */
  useEffect(() => {
    setGroupsLoading(true);
    fetch(`/api/playlists/${playlistId}/items?mode=groups&type=channel`)
      .then((r) => r.json())
      .then(
        (data: {
          groups: { name: string; count: number; samples: string[] }[];
        }) => {
          const classified: GroupInfo[] = data.groups.map((g) => ({
            ...g,
            family: classifyGroup(g.name, g.samples),
          }));
          setGroups(classified);
        },
      )
      .catch(() => {})
      .finally(() => setGroupsLoading(false));
  }, [playlistId]);

  /* ── Debounced search ── */
  useEffect(() => {
    if (!isSearching) {
      setSearchItems([]);
      setSearchTotal(0);
      return;
    }

    setSearchLoading(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    searchTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          type: 'channel',
          search,
          page: '1',
          limit: '100',
        });
        const res = await fetch(
          `/api/playlists/${playlistId}/items?${params}`,
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSearchItems(data.items);
        setSearchTotal(data.total);
      } catch {
        /* ignore */
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, playlistId, isSearching]);

  /* ── Fetch channels for expanded group ── */
  const fetchGroupChannels = useCallback(
    async (groupName: string) => {
      if (groupItems[groupName]) return;
      setGroupItemsLoading(groupName);
      try {
        const params = new URLSearchParams({
          type: 'channel',
          group: groupName || '__ungrouped__',
          limit: '200',
          page: '1',
        });
        const res = await fetch(
          `/api/playlists/${playlistId}/items?${params}`,
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setGroupItems((prev) => ({ ...prev, [groupName]: data.items }));
      } catch {
        /* ignore */
      } finally {
        setGroupItemsLoading(null);
      }
    },
    [playlistId, groupItems],
  );

  const handleToggleGroup = useCallback(
    (groupName: string) => {
      if (expandedGroup === groupName) {
        setExpandedGroup(null);
      } else {
        setExpandedGroup(groupName);
        void fetchGroupChannels(groupName);
      }
    },
    [expandedGroup, fetchGroupChannels],
  );

  /* ── Derived data ── */
  const familyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of groups) {
      counts[g.family] = (counts[g.family] || 0) + g.count;
    }
    return counts;
  }, [groups]);

  const activeFamilies = useMemo(() => {
    return FAMILIES.filter((f) => (familyCounts[f.id] || 0) > 0);
  }, [familyCounts]);

  const filteredGroups = useMemo(() => {
    const filtered =
      selectedFamily === 'all'
        ? groups
        : groups.filter((g) => g.family === selectedFamily);
    return showAllGroups ? filtered : filtered.slice(0, 40);
  }, [groups, selectedFamily, showAllGroups]);

  const totalFilteredGroups = useMemo(() => {
    if (selectedFamily === 'all') return groups.length;
    return groups.filter((g) => g.family === selectedFamily).length;
  }, [groups, selectedFamily]);

  /* ── Render ── */
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search channels..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Search results mode */}
      {isSearching ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground px-1">
            {searchLoading ? (
              'Searching...'
            ) : (
              <>
                {searchTotal.toLocaleString()} result
                {searchTotal !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
              </>
            )}
          </p>

          {searchLoading ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[52px] rounded-xl" />
              ))}
            </div>
          ) : searchItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <Search className="h-5 w-5 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No channels found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {searchItems.map((item) => (
                <ChannelCard
                  key={item.id}
                  item={item}
                  onSelect={() => onSelectItem(item)}
                />
              ))}
            </div>
          )}
        </div>
      ) : groupsLoading ? (
        /* Loading state */
        <div className="space-y-4">
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        /* Browse mode */
        <div className="space-y-4">
          {/* Family pills */}
          {activeFamilies.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setSelectedFamily('all');
                  setShowAllGroups(false);
                  setExpandedGroup(null);
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedFamily === 'all'
                    ? 'border-foreground/20 bg-foreground/5 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Globe className="h-3 w-3" />
                All
                <span className="text-muted-foreground/70">
                  {totalChannels.toLocaleString()}
                </span>
              </button>

              {activeFamilies.map((fam) => {
                const Icon = fam.icon;
                const count = familyCounts[fam.id] || 0;
                const active = selectedFamily === fam.id;
                return (
                  <button
                    key={fam.id}
                    type="button"
                    onClick={() => {
                      setSelectedFamily(fam.id);
                      setShowAllGroups(false);
                      setExpandedGroup(null);
                    }}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-foreground/20 bg-foreground/5 text-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {fam.label}
                    <span className="text-muted-foreground/70">
                      {count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Group list */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground px-1">
              {totalFilteredGroups.toLocaleString()} group
              {totalFilteredGroups !== 1 ? 's' : ''}
              {selectedFamily !== 'all'
                ? ` in ${FAMILY_MAP.get(selectedFamily as ChannelFamily)?.label || selectedFamily}`
                : ''}
            </p>

            <div className="space-y-2">
              {filteredGroups.map((group) => (
                <GroupSection
                  key={group.name}
                  group={group}
                  isExpanded={expandedGroup === group.name}
                  items={groupItems[group.name]}
                  isLoading={groupItemsLoading === group.name}
                  onToggle={() => handleToggleGroup(group.name)}
                  onSelectItem={onSelectItem}
                />
              ))}
            </div>

            {/* Show more */}
            {!showAllGroups && totalFilteredGroups > 40 && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllGroups(true)}
                >
                  <FolderOpen className="mr-2 h-3.5 w-3.5" />
                  Show all {totalFilteredGroups} groups
                </Button>
              </div>
            )}

            {filteredGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
                <Tv className="h-5 w-5 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No groups in this category
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
