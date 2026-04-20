'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { PlaylistItem } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoPlayerDialog } from '@/components/playlists/video-player-dialog';
import {
  Play, Search, Tv, X, ChevronLeft, ChevronDown,
  Radio, Hash, Layers, ListMusic,
} from 'lucide-react';

/* ═══════════════════════════════════════════════
   Playlist type for the picker
   ═══════════════════════════════════════════════ */

interface BrowsePlaylist {
  id: string;
  name: string;
  channels_count: number;
}

/* Module-level caches (survive route changes) */
let liveTvPlaylistCache: { playlists: BrowsePlaylist[]; ts: number } | null = null;
const liveTvChannelCache = new Map<string, { sections: any[]; total: number; ts: number }>();
let liveTvActivePlaylistId: string | null = null;

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
  // Content-type categories
  { key: 'sports',       label: 'Sports',       icon: '⚽', patterns: /sport|bein|sky\s?sport|espn|dazn|fox\s?sport|eurosport|eleven|supersport|arena\s?sport|nfl|nba|mlb|nhl|ufc|wwe|boxing|tennis|golf|f1\b|formula|bundesliga|premier\s?league|la\s?liga|serie\s?a|ligue\s?1|futbol|football|soccer|cricket|rugby/i },
  { key: 'news',         label: 'News',         icon: '📰', patterns: /news|nachrichten|noticias|actualit|cnn|bbc\s?news|al\s?jazeera|sky\s?news|france\s?24|euronews|cnbc|bloomberg|rt\b|dw\b|trt\s?world|fox\s?news|msnbc|n-tv|ntv|welt\b|bfm|lci|tagesschau/i },
  { key: 'kids',         label: 'Kids',         icon: '🧸', patterns: /kid|child|cartoon|nickelodeon|nick\b|disney|baby|junior|tiji|gulli|boomerang|cneto|spacetoon|karusel|kinder|enfant|jim\s?jam|duck\s?tv|toon|animat/i },
  { key: 'movies',       label: 'Cinema',       icon: '🎬', patterns: /movie|cinema|film|hbo|showtime|starz|paramount|amc\b|tcm\b|cinemax|kino\b|cine\b|pelicul|netflix|prime\s?video|hallmark|lifetime/i },
  { key: 'music',        label: 'Music',        icon: '🎵', patterns: /music|musik|musique|mtv\b|vh1|trace|melody|muzz|rotana\s?(music|clip)|radio|hit\s?(tv|music)|club\b.*tv|ibiza|deluxe\s?music|viva\b/i },
  { key: 'documentary',  label: 'Documentary',  icon: '🌍', patterns: /document|discovery|nat\s?geo|national\s?geo|history|animal\s?planet|science|planet\s?earth|bbc\s?earth|love\s?nature|doku|wildlife|travel|adventure|explore/i },
  { key: 'religious',    label: 'Religious',    icon: '🕌', patterns: /relig|quran|islam|christian|church|gospel|prayer|bible|catholic|faith|iqra|kanal\s?7|trt\s?diyanet|huda|god\s?tv|daystar|ewtn/i },
  { key: 'entertainment',label: 'Entertainment',icon: '🎭', patterns: /entertain|general|variety|comedy|drama|lifestyle|reality|tlc|bravo|e!\b|fx\b|usa\s?network|tbs|tnt\b|food|cooking|cuisine|hgtv|diy\b/i },
  { key: 'education',    label: 'Education',    icon: '📚', patterns: /educat|learn|school|university|lecture|wissen|ted\b|pbs\b|knowledge/i },
  { key: 'adult',        label: '18+',          icon: '🔞', patterns: /adult|18\+|xxx|eroti|playboy|hustle/i },

  // Country / language categories
  { key: 'arabic',       label: 'Arabic',       icon: '🌙', patterns: /arab|mbc\b|rotana|lbc\b|ldc\b|al[\s-]|abu\s?dhabi|dubai\b|qatar|kuwait|oman|jordan|iraq|syria|leban|egypt|tunis|morocco|maroc|algeri|libya|sudan|yemen|saudi|bahrain|nile\s?sat/i },
  { key: 'turkish',      label: 'Turkish',      icon: '🇹🇷', patterns: /turk|türk|trt\b|kanal\s?d|star\s?tv|atv\b|show\s?tv|fox\s?tv.*tr|teve2|tv8\b|beyaz|habert|cnn\s?turk/i },
  { key: 'french',       label: 'French',       icon: '🇫🇷', patterns: /franc|fran[çc]|tf1|france\s?\d|m6\b|canal\s?\+|arte\s?(fr)?|bfm|lci|rmc|c8\b|cstar|w9\b|nrj/i },
  { key: 'german',       label: 'German',       icon: '🇩🇪', patterns: /german|deutsch|ard\b|zdf\b|rtl\b|sat\.?1|pro\s?7|vox\b|kabel|n-tv|ntv\b|welt\b|phoenix|3sat|arte\s?de|servus|orf\b|srf\b|swiss/i },
  { key: 'english_uk',   label: 'UK',           icon: '🇬🇧', patterns: /\b(uk|british|england)\b|bbc\s?(one|two|three|four)|itv\b|channel\s?(4|5)|sky\s?(one|atlantic|cinema)|dave\b|e4\b|film4|more4|quest/i },
  { key: 'english_us',   label: 'USA',          icon: '🇺🇸', patterns: /\b(usa|america|us\s?tv)\b|abc\b|nbc\b|cbs\b|fox\b(?!.*tr)|pbs\b|hulu|peacock|bet\b|cw\b|freeform/i },
  { key: 'spanish',      label: 'Spanish',      icon: '🇪🇸', patterns: /spain|spanish|español|espanol|tve\b|antena\s?3|telecinco|la\s?sexta|cuatro\b|movistar|gol\b|barca|univision|telemundo|televisa/i },
  { key: 'portuguese',   label: 'Portuguese',   icon: '🇵🇹', patterns: /portug|brasil|brazil|rtp\b|sic\b|tvi\b|globo|band\b|record\b|benfica|sporting|porto\s?canal|cmtv/i },
  { key: 'italian',      label: 'Italian',      icon: '🇮🇹', patterns: /ital|rai\s?\d|rai\b|mediaset|canale\s?5|italia\s?1|rete\s?4|la7\b|sky\s?it|premium\s?(cinema|sport)|real\s?time/i },
  { key: 'dutch',        label: 'Dutch',        icon: '🇳🇱', patterns: /dutch|nederland|npo\b|rtl\s?(4|5|7|8)|sbs\s?6|net\s?5|veronica|vtm\b|een\b|canvas/i },
  { key: 'polish',       label: 'Polish',       icon: '🇵🇱', patterns: /pol(ish|ska|and)|tvp\b|tvn\b|polsat|tv\s?puls|canal\s?\+.*pl|eleven.*pl/i },
  { key: 'romanian',     label: 'Romanian',     icon: '🇷🇴', patterns: /roman|antena\s?(1|3)|pro\s?tv|kanal\s?d.*ro|digi\b|tvr\b|prima\s?tv|look\s?tv|dolce/i },
  { key: 'indian',       label: 'Indian',       icon: '🇮🇳', patterns: /india|hindi|tamil|telugu|malayalam|kannada|star\s?(plus|gold|bharat)|zee\b|sony.*tv|colors|ndtv|aaj\s?tak|sun\s?tv/i },
  { key: 'russian',      label: 'Russian',      icon: '🇷🇺', patterns: /russ|росс|первый|россия|матч|нтв|рен|тнт|стс|домашний|пятница/i },
  { key: 'balkan',       label: 'Balkan',       icon: '🏔️', patterns: /balkan|serb|croat|bosn|macedon|sloven|montenegr|albani|kosovo|hrt\b|nova\s?tv.*hr|rts\b|pink\b|happy\s?tv|vizion|klan/i },
  { key: 'greek',        label: 'Greek',        icon: '🇬🇷', patterns: /greek|greece|mega\b.*gr|ant1|alpha\s?tv|skai|star\s?tv.*gr|ert\b|open\s?tv/i },
  { key: 'scandinavian', label: 'Nordic',        icon: '🇸🇪', patterns: /scandinav|nordic|svt\b|tv4\b.*se|nrk\b|tv2\b.*(no|dk)|dr\b.*dk|yle\b|finland|sweden|norway|denmark|viasat/i },
  { key: 'african',      label: 'African',      icon: '🌍', patterns: /afri(ca|que)|nigeria|ghana|kenya|ethiopia|south\s?africa|cameroon|congo|dstv|gotv|nollywood|afro/i },
  { key: 'asian',        label: 'Asian',        icon: '🌏', patterns: /asian|korea|japan|chin(a|ese)|taiwan|filipino|thai|vietnam|malaysia|indonesia|nhk\b|kbs\b|tvb\b|astro\b|gma\b/i },
  { key: 'persian',      label: 'Persian',      icon: '🇮🇷', patterns: /persian|iran|farsi|gem\s?tv|manoto|irib|press\s?tv/i },
  { key: 'kurdish',      label: 'Kurdish',      icon: '☀️', patterns: /kurd|rudaw|kurdistan|nrt\b|payam/i },
];

/* ── Smart prefix extraction ── */

const PREFIX_RX = /^([A-Z]{2,3})\s*[|\-:│║·/\\]\s*/i;

const KNOWN_CODES = new Set([
  'us','uk','gb','ca','au','nz','de','at','ch','fr','be','es','mx','ar','cl','co','pe','ve',
  'pt','br','it','nl','pl','ro','tr','in','pk','bd','sa','ae','kw','qa','bh','om','iq','jo',
  'lb','sy','eg','ma','dz','tn','ly','sd','ye','ru','ua','by','kz','se','no','dk','fi','gr',
  'cy','rs','hr','ba','mk','si','me','bg','al','xk','ir','af','kr','jp','cn','tw','hk','ph',
  'th','vn','id','my','ng','gh','ke','za','et','tz','cm','il','cu','do','ec','py','uy','bo',
  'cr','pa','gt','hn',
]);

const CODE_TO_CAT: Record<string, string> = {
  us: 'english_us',
  uk: 'english_uk', gb: 'english_uk', au: 'english_uk', nz: 'english_uk', ca: 'english_uk',
  de: 'german', at: 'german', ch: 'german',
  fr: 'french', be: 'french',
  es: 'spanish', mx: 'spanish', cl: 'spanish', co: 'spanish', pe: 'spanish', ve: 'spanish',
  cu: 'spanish', do: 'spanish', ec: 'spanish', py: 'spanish', uy: 'spanish', bo: 'spanish',
  cr: 'spanish', pa: 'spanish', gt: 'spanish', hn: 'spanish',
  pt: 'portuguese', br: 'portuguese',
  it: 'italian', nl: 'dutch', pl: 'polish', ro: 'romanian', tr: 'turkish',
  ar: 'arabic', sa: 'arabic', ae: 'arabic', kw: 'arabic', qa: 'arabic', bh: 'arabic',
  om: 'arabic', iq: 'arabic', jo: 'arabic', lb: 'arabic', sy: 'arabic', eg: 'arabic',
  ma: 'arabic', dz: 'arabic', tn: 'arabic', ly: 'arabic', sd: 'arabic', ye: 'arabic',
  in: 'indian', pk: 'indian', bd: 'indian',
  ru: 'russian', ua: 'russian', by: 'russian', kz: 'russian',
  se: 'scandinavian', no: 'scandinavian', dk: 'scandinavian', fi: 'scandinavian',
  gr: 'greek', cy: 'greek',
  rs: 'balkan', hr: 'balkan', ba: 'balkan', mk: 'balkan', si: 'balkan', me: 'balkan',
  bg: 'balkan', al: 'balkan', xk: 'balkan',
  ir: 'persian', af: 'persian',
  kr: 'asian', jp: 'asian', cn: 'asian', tw: 'asian', hk: 'asian', ph: 'asian',
  th: 'asian', vn: 'asian', id: 'asian', my: 'asian',
  ng: 'african', gh: 'african', ke: 'african', za: 'african', et: 'african', tz: 'african', cm: 'african',
};

function extractPrefix(raw: string): { code: string | null; rest: string } {
  const m = raw.match(PREFIX_RX);
  if (m) {
    const code = m[1].toLowerCase();
    if (KNOWN_CODES.has(code)) {
      const rest = raw.slice(m[0].length).trim();
      return { code, rest: rest || raw };
    }
  }
  return { code: null, rest: raw };
}

function matchCategoryPatterns(text: string): string {
  for (const def of CATEGORY_DEFS) {
    if (def.patterns.test(text)) return def.key;
  }
  return 'other';
}

function classifyGroup(groupName: string, channelNames: string[] = []): string {
  const { code, rest } = extractPrefix(groupName);

  // 1) Match cleaned suffix
  const suffixResult = matchCategoryPatterns(rest);
  if (suffixResult !== 'other') return suffixResult;

  // 2) Match full group_title
  const fullResult = matchCategoryPatterns(groupName);
  if (fullResult !== 'other') return fullResult;

  // 3) Country prefix → category
  if (code && CODE_TO_CAT[code]) return CODE_TO_CAT[code];

  // 4) Channel-name majority vote
  if (channelNames.length > 0) {
    const votes: Record<string, number> = {};
    for (const name of channelNames.slice(0, 8)) {
      const v = matchCategoryPatterns(name);
      if (v !== 'other') votes[v] = (votes[v] || 0) + 1;
    }
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) return best[0];
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
   Playlist Picker — shown when no playlist is selected
   ═══════════════════════════════════════════════ */

function PlaylistPicker({
  playlists,
  onSelect,
}: {
  playlists: BrowsePlaylist[];
  onSelect: (p: BrowsePlaylist) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pt-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mx-auto mb-3">
          <ListMusic className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground tracking-tight">Select a Playlist</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Choose which playlist to browse. Channels are scoped to your selection.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {playlists.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className="group flex items-center gap-3 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:bg-primary/5 p-4 text-left transition-all duration-200 active:scale-[0.97]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors flex-shrink-0">
              <Tv className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-foreground truncate">{p.name}</p>
              <p className="text-[12px] text-muted-foreground">{(p.channels_count || 0).toLocaleString()} channels</p>
            </div>
            <ChevronLeft className="h-4 w-4 text-muted-foreground/30 rotate-180 group-hover:text-primary/50 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Playlist Switcher — dropdown when browsing
   ═══════════════════════════════════════════════ */

function PlaylistSwitcher({
  playlists,
  active,
  onSwitch,
}: {
  playlists: BrowsePlaylist[];
  active: BrowsePlaylist;
  onSwitch: (p: BrowsePlaylist) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (playlists.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg bg-muted/60 hover:bg-muted px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ListMusic className="h-3.5 w-3.5" />
        <span className="truncate max-w-[120px] sm:max-w-[200px]">{active.name}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] max-w-[300px] rounded-xl bg-popover border border-border shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-150">
          {playlists.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSwitch(p); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-[13px] transition-colors ${
                p.id === active.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground/80 hover:bg-muted/60'
              }`}
            >
              <span className="truncate block">{p.name}</span>
              <span className="text-[11px] text-muted-foreground">{(p.channels_count || 0).toLocaleString()} ch</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main LiveTV Browser — playlist-first architecture
   ═══════════════════════════════════════════════ */

export function LiveTVBrowser() {
  // Playlist state
  const [playlists, setPlaylists] = useState<BrowsePlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [activePlaylist, setActivePlaylistRaw] = useState<BrowsePlaylist | null>(null);

  // Wrap setActivePlaylist to persist selection in module cache
  const setActivePlaylist = useCallback((p: BrowsePlaylist | null) => {
    setActivePlaylistRaw(p);
    liveTvActivePlaylistId = p?.id ?? null;
  }, []);

  // Channel state (scoped to selected playlist)
  const [sections, setSections] = useState<GroupedSection[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [totalChannels, setTotalChannels] = useState(0);

  // UI state
  const [globalSearch, setGlobalSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [playerItem, setPlayerItem] = useState<PlaylistItem | null>(null);
  const [playerChannelList, setPlayerChannelList] = useState<PlaylistItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(globalSearch), 250);
    return () => clearTimeout(t);
  }, [globalSearch]);

  // Phase 1: Fetch playlists on mount (cached)
  useEffect(() => {
    let cancelled = false;
    const cached = liveTvPlaylistCache;
    if (cached) {
      setPlaylists(cached.playlists);
      // Restore previously active playlist or auto-select single
      const restored = liveTvActivePlaylistId
        ? cached.playlists.find((p) => p.id === liveTvActivePlaylistId) ?? null
        : cached.playlists.length === 1 ? cached.playlists[0] : null;
      if (restored) setActivePlaylist(restored);
      setPlaylistsLoading(false);
      if (Date.now() - cached.ts < 5 * 60 * 1000) return;
    }
    async function loadPlaylists() {
      if (!cached) setPlaylistsLoading(true);
      setPlaylistsError(null);
      try {
        const res = await fetch('/api/browse?mode=playlists');
        if (res.redirected) {
          if (!cancelled) setPlaylistsError('Session expired. Please refresh the page.');
          if (!cancelled) setPlaylistsLoading(false);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setPlaylistsError('Failed to load playlists.');
          if (!cancelled) setPlaylistsLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const list: BrowsePlaylist[] = data.playlists || [];
        setPlaylists(list);
        liveTvPlaylistCache = { playlists: list, ts: Date.now() };
        if (list.length === 1) setActivePlaylist(list[0]);
      } catch {
        if (!cancelled) setPlaylistsError('Network error loading playlists.');
      }
      if (!cancelled) setPlaylistsLoading(false);
    }
    loadPlaylists();
    return () => { cancelled = true; };
  }, []);

  // Phase 2: Load channels when a playlist is selected (cached)
  useEffect(() => {
    if (!activePlaylist) {
      setSections([]);
      setTotalChannels(0);
      return;
    }
    let cancelled = false;
    const cacheKey = activePlaylist.id;
    const cached = liveTvChannelCache.get(cacheKey);
    if (cached) {
      setSections(cached.sections);
      setTotalChannels(cached.total);
      setChannelsLoading(false);
      if (Date.now() - cached.ts < 5 * 60 * 1000) return;
    }
    async function loadChannels() {
      if (!cached) setChannelsLoading(true);
      setActiveCategory(null);
      setGlobalSearch('');
      const params = new URLSearchParams({
        type: 'channel',
        mode: 'grouped',
        playlist_id: activePlaylist!.id,
      });
      try {
        const res = await fetch(`/api/browse?${params}`);
        if (res.redirected || !res.ok) {
          if (!cancelled) setChannelsLoading(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          const s = data.sections || [];
          const t = data.total || 0;
          setSections(s);
          setTotalChannels(t);
          liveTvChannelCache.set(cacheKey, { sections: s, total: t, ts: Date.now() });
        }
      } catch { /* network error */ }
      if (!cancelled) setChannelsLoading(false);
    }
    loadChannels();
    return () => { cancelled = true; };
  }, [activePlaylist]);

  // Build categories from raw group_title sections
  const categories = useMemo<MergedCategory[]>(() => {
    const buckets = new Map<string, { groups: Map<string, PlaylistItem[]>; def: CategoryDef | null }>();

    for (const section of sections) {
      const channelNames = section.items.slice(0, 8).map((it: PlaylistItem) => it.name);
      const catKey = classifyGroup(section.name, channelNames);
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

    // Break up "Other" if it's disproportionately large (>40% of total)
    const otherBucket = buckets.get('other');
    if (otherBucket && otherBucket.groups.size > 3) {
      const totalAll = sections.reduce((s: number, sec: GroupedSection) => s + sec.items.length, 0);
      let otherCount = 0;
      for (const items of otherBucket.groups.values()) otherCount += items.length;

      if (otherCount / Math.max(totalAll, 1) > 0.4) {
        const stillOther = new Map<string, PlaylistItem[]>();
        for (const [name, items] of otherBucket.groups.entries()) {
          // Deep classify: majority-vote on ALL channel names
          const votes: Record<string, number> = {};
          for (const item of items) {
            const v = matchCategoryPatterns(item.name);
            if (v !== 'other') votes[v] = (votes[v] || 0) + 1;
          }
          const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
          if (best && best[1] / Math.max(items.length, 1) >= 0.3) {
            if (!buckets.has(best[0])) {
              buckets.set(best[0], { groups: new Map(), def: CATEGORY_DEFS.find((d) => d.key === best[0]) || null });
            }
            const target = buckets.get(best[0])!;
            const ex = target.groups.get(name) || [];
            target.groups.set(name, [...ex, ...items]);
          } else {
            stillOther.set(name, items);
          }
        }
        if (stillOther.size === 0) {
          buckets.delete('other');
        } else {
          otherBucket.groups = stillOther;
        }
      }
    }

    const result: MergedCategory[] = [];
    for (const [key, bucket] of buckets.entries()) {
      const groups = Array.from(bucket.groups.entries())
        .map(([name, items]) => {
          const { rest } = extractPrefix(name);
          return { name: rest || name, items };
        })
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

    // Sort: largest first, but push "Other" to the end
    return result.sort((a, b) => {
      if (a.key === 'other') return 1;
      if (b.key === 'other') return -1;
      return b.totalCount - a.totalCount;
    });
  }, [sections]);

  // Flat channel list for global search
  const allChannels = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Normalize for search: strip diacritics (ü→u, é→e, ß→ss), lowercase
  const normalizeSearch = useCallback((s: string) =>
    s.replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  , []);

  // Global search results (client-side, normalized + multi-field)
  const searchResults = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    const q = normalizeSearch(debouncedSearch);
    const tokens = q.split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];

    const scored: { item: PlaylistItem; score: number }[] = [];
    for (const ch of allChannels) {
      const nName = normalizeSearch(ch.name);
      const nGroup = normalizeSearch(ch.group_title ?? '');
      const nTvgName = normalizeSearch((ch as any).tvg_name ?? '');
      const nTvgId = normalizeSearch((ch as any).tvg_id ?? '');

      let allMatch = true;
      let total = 0;
      for (const tok of tokens) {
        let matched = false;
        if (nName.includes(tok)) { matched = true; total += nName.startsWith(tok) ? 10 : 5; }
        if (nGroup.includes(tok)) { matched = true; total += 3; }
        if (nTvgName.includes(tok)) { matched = true; total += 2; }
        if (nTvgId.includes(tok)) { matched = true; total += 1; }
        if (!matched) { allMatch = false; break; }
      }
      if (allMatch) scored.push({ item: ch, score: total });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 100).map((s) => s.item);
  }, [allChannels, debouncedSearch, normalizeSearch]);

  const isSearching = debouncedSearch.trim().length > 0;

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

  const handleSelectPlaylist = useCallback((p: BrowsePlaylist) => {
    setActivePlaylist(p);
  }, []);

  /* ── Phase 0: Loading playlists ── */
  if (playlistsLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-32 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  /* ── Phase 0b: Error or no playlists ── */
  if (playlistsError || playlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
          <Radio className="h-6 w-6 text-muted-foreground/30" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">
          {playlistsError || 'No active playlists. Add a playlist to start watching Live TV.'}
        </p>
        {playlistsError && (
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  /* ── Phase 1: Playlist Picker (multiple playlists, none selected) ── */
  if (!activePlaylist) {
    return <PlaylistPicker playlists={playlists} onSelect={handleSelectPlaylist} />;
  }

  /* ── Phase 2: Category Channel List view (drilled into a category) ── */
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

  const loading = channelsLoading;

  /* ── Phase 2: Channel browser (playlist selected) ── */
  return (
    <div className="space-y-5">
      {/* ── Header with playlist switcher ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Tv className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Live TV</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {!loading && totalChannels > 0 && (
              <p className="text-[12px] text-muted-foreground">
                {totalChannels.toLocaleString()} channels &middot; {categories.length} categories
              </p>
            )}
          </div>
        </div>
        <PlaylistSwitcher
          playlists={playlists}
          active={activePlaylist}
          onSwitch={handleSelectPlaylist}
        />
      </div>

      {/* ── Search (scoped to selected playlist) ── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={`Search in ${activePlaylist.name}...`}
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

      {/* ── Search results ── */}
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

      {/* ── Category Grid ── */}
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
            No channels in this playlist.
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
