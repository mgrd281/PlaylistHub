'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  X, AlertCircle, Loader2, Copy,
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Settings, Search, Share2,
  PictureInPicture2, MonitorPlay, ChevronLeft,
  Radio, PanelRightOpen, PanelRightClose, Tv,
  RectangleHorizontal, Square, Expand,
  Film, Clapperboard, Clock, Eye,
} from 'lucide-react';

type ViewMode = 'normal' | 'large' | 'theater';
import { PlaylistItem } from '@/types/database';
import { toast } from 'sonner';

/* ── Pre-load HLS.js module to eliminate dynamic import delay ── */
let _hlsModuleCache: Promise<typeof import('hls.js')> | null = null;
function getHlsModule() {
  if (!_hlsModuleCache) _hlsModuleCache = import('hls.js');
  return _hlsModuleCache;
}
// Kick off preload immediately on module evaluation (client-side only)
if (typeof window !== 'undefined') getHlsModule();

interface VideoPlayerDialogProps {
  item: PlaylistItem | null;
  channelList?: PlaylistItem[];
  /** Pre-loaded items from the same browse context (movies/series) for recommendations */
  relatedItems?: PlaylistItem[];
  onClose: () => void;
  onNavigate?: (item: PlaylistItem) => void;
}

/* ── Resume position storage ── */
const RESUME_KEY = 'playlisthub_resume';

function savePosition(streamUrl: string, time: number) {
  try {
    const data = JSON.parse(localStorage.getItem(RESUME_KEY) || '{}');
    if (time < 5) {
      delete data[streamUrl];
    } else {
      data[streamUrl] = Math.floor(time);
    }
    // Keep max 200 entries
    const keys = Object.keys(data);
    if (keys.length > 200) {
      for (let i = 0; i < keys.length - 200; i++) delete data[keys[i]];
    }
    localStorage.setItem(RESUME_KEY, JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

function clearPosition(streamUrl: string) {
  try {
    const data = JSON.parse(localStorage.getItem(RESUME_KEY) || '{}');
    delete data[streamUrl];
    localStorage.setItem(RESUME_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/* ── Helpers ── */

function resolveStreamUrl(item: PlaylistItem, episodeUrl?: string): string {
  const url = episodeUrl || item.stream_url;
  // Live channels: always use HLS (.m3u8)
  if (item.content_type === 'channel' || url.includes('/live/')) {
    return url.replace(/\.\w+$/, '.m3u8');
  }
  // Keep original extension for movies/series (not all servers support HLS conversion)
  return url;
}

/** Extract Xtream credentials from a stream URL */
function extractXtreamInfo(streamUrl: string) {
  const match = streamUrl.match(
    /^(https?:\/\/[^/]+)\/(series|movie|live)\/([^/]+)\/([^/]+)\/(\d+)\.\w+$/
  );
  if (!match) return null;
  return { baseUrl: match[1], type: match[2], username: match[3], password: match[4], id: match[5] };
}

/** Check if a series URL needs episode resolution (Xtream catalog entry) */
function isXtreamSeriesUrl(item: PlaylistItem): boolean {
  return (
    (item.content_type === 'series' || item.stream_url.includes('/series/')) &&
    /\/series\/[^/]+\/[^/]+\/\d+\.\w+$/.test(item.stream_url)
  );
}

function proxyUrl(streamUrl: string): string {
  return `/api/stream?url=${encodeURIComponent(streamUrl)}`;
}

/** Try loading a URL into <video> and wait for success or failure */
function tryVideoUrl(
  video: HTMLVideoElement,
  url: string,
  timeoutMs = 8000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const onLoaded = () => { cleanup(); resolve(true); };
    const onError = () => { cleanup(); resolve(false); };
    const timer = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.src = url;
    video.load();
  });
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── Speed options ── */
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* ── VOD Recommendation Card (YouTube-style thumbnail + title) ── */
const DARK_TONES = [
  'from-neutral-800 to-neutral-900',
  'from-zinc-800 to-zinc-900',
  'from-stone-800 to-stone-900',
  'from-gray-800 to-gray-900',
];
function darkTone(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return DARK_TONES[Math.abs(h) % DARK_TONES.length];
}

function VodRecommendationCard({ item, onPlay, isCompact }: { item: PlaylistItem; onPlay: () => void; isCompact?: boolean }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const hasImage = item.tvg_logo && !imgError;

  return (
    <button
      type="button"
      onClick={onPlay}
      className="group flex gap-3 w-full rounded-xl p-2 text-left transition-all hover:bg-foreground/[0.05] active:scale-[0.99]"
    >
      {/* Thumbnail */}
      <div className={`relative ${isCompact ? 'w-[140px]' : 'w-[168px]'} aspect-video rounded-lg overflow-hidden shrink-0 bg-muted`}>
        {hasImage ? (
          <>
            <img
              src={item.tvg_logo!}
              alt=""
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
            {!imgLoaded && <div className="absolute inset-0 bg-muted animate-pulse" />}
          </>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${darkTone(item.name)}`}>
            <div className="absolute inset-0 flex items-center justify-center">
              {item.content_type === 'series'
                ? <Clapperboard className="h-5 w-5 text-white/20" />
                : <Film className="h-5 w-5 text-white/20" />
              }
            </div>
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded backdrop-blur-sm">
          {item.content_type === 'series' ? 'Series' : 'Movie'}
        </div>
        {/* Hover play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg scale-90 group-hover:scale-100 transition-transform duration-200">
            <Play className="h-4 w-4 text-black fill-black ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-[13px] font-medium text-foreground leading-snug line-clamp-2 group-hover:text-foreground transition-colors">
          {item.name}
        </p>
        {item.group_title && (
          <p className="text-[11px] text-muted-foreground truncate mt-1.5">{item.group_title}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground/60 capitalize bg-muted/60 px-1.5 py-0.5 rounded">{item.content_type}</span>
        </div>
      </div>
    </button>
  );
}

export function VideoPlayerDialog({ item, channelList, relatedItems, onClose, onNavigate }: VideoPlayerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hlsRef = useRef<import('hls.js').default | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [qualities, setQualities] = useState<{ height: number; label: string; index: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto
  const [pip, setPip] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<'main' | 'speed' | 'quality' | null>(null);
  const [seekIndicator, setSeekIndicator] = useState<{ side: 'left' | 'right'; seconds: number } | null>(null);
  const seekIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [showSidePanel, setShowSidePanel] = useState(true);

  /* ── Playback lifecycle guards ── */
  const [mainVideoLoaded, setMainVideoLoaded] = useState(false);
  const initInProgressRef = useRef(false);

  /* ── Seek preview thumbnails ── */
  const thumbnailCacheRef = useRef<Map<number, string>>(new Map());
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbVideoRef = useRef<HTMLVideoElement | null>(null);
  const thumbHlsRef = useRef<import('hls.js').default | null>(null);
  const thumbSeekingRef = useRef(false);
  const thumbLastSeekRef = useRef<number | null>(null);
  const [seekPreviewThumb, setSeekPreviewThumb] = useState<string | null>(null);
  const [seekPreviewPos, setSeekPreviewPos] = useState<{ x: number; y: number } | null>(null);

  // Series episode state
  const [seriesEpisodes, setSeriesEpisodes] = useState<{
    seasons: { season: number; episodes: { id: string; title: string; season: number; episode: number; streamUrl: string }[] }[];
    seriesName: string;
  } | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [activeEpisode, setActiveEpisode] = useState<{ streamUrl: string; title: string } | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);

  /* ── Channel navigation ── */
  const currentIndex = useMemo(() => {
    if (!item || !channelList?.length) return -1;
    return channelList.findIndex(ch => ch.id === item.id);
  }, [item, channelList]);

  const prevChannel = currentIndex > 0 ? channelList![currentIndex - 1] : null;
  const nextChannel = (currentIndex >= 0 && currentIndex < (channelList?.length ?? 0) - 1) ? channelList![currentIndex + 1] : null;
  const hasNavigation = !!(channelList && channelList.length > 1 && currentIndex >= 0);

  const relatedChannels = useMemo(() => {
    if (!item || !channelList?.length) return [];
    const MAX = 40;

    // 1) Same group_title first (excluding current)
    const sameGroup = channelList.filter(
      ch => ch.id !== item.id && ch.group_title === item.group_title
    );

    if (sameGroup.length >= MAX) return sameGroup.slice(0, MAX);

    // 2) Fill with nearby channels from the full list (different group)
    const sameGroupIds = new Set(sameGroup.map(ch => ch.id));
    sameGroupIds.add(item.id);
    const remaining = MAX - sameGroup.length;
    const idx = currentIndex >= 0 ? currentIndex : 0;

    // Take channels around the current index
    const nearby: PlaylistItem[] = [];
    let lo = idx - 1, hi = idx + 1;
    while (nearby.length < remaining && (lo >= 0 || hi < channelList.length)) {
      if (hi < channelList.length && !sameGroupIds.has(channelList[hi].id)) {
        nearby.push(channelList[hi]);
      }
      if (lo >= 0 && !sameGroupIds.has(channelList[lo].id)) {
        nearby.push(channelList[lo]);
      }
      hi++;
      lo--;
    }

    return [...sameGroup, ...nearby].slice(0, MAX);
  }, [item, channelList, currentIndex]);

  const [liveChannelSearch, setLiveChannelSearch] = useState('');
  const [liveSupportReady, setLiveSupportReady] = useState(false);

  const filteredLiveChannels = useMemo(() => {
    if (!liveChannelSearch.trim()) return relatedChannels;
    const q = liveChannelSearch.toLowerCase();
    return relatedChannels.filter(ch =>
      ch.name.toLowerCase().includes(q) || ch.group_title?.toLowerCase().includes(q)
    );
  }, [relatedChannels, liveChannelSearch]);

  // Defer non-essential live-page UI so stream startup stays fast.
  useEffect(() => {
    const vod = item ? (item.content_type === 'movie' || item.content_type === 'series') : false;
    if (vod) {
      setLiveSupportReady(false);
      return;
    }
    setLiveSupportReady(false);
    const timer = setTimeout(() => setLiveSupportReady(true), 650);
    return () => clearTimeout(timer);
  }, [item]);

  /* ── VOD recommendations (movies/series) — lazy loaded ── */
  const [vodRecommendations, setVodRecommendations] = useState<PlaylistItem[]>([]);
  const [vodRecsLoading, setVodRecsLoading] = useState(false);
  const [vodSearch, setVodSearch] = useState('');
  const isVod = item ? (item.content_type === 'movie' || item.content_type === 'series') : false;

  // Filter recommendations by search
  const filteredRecommendations = useMemo(() => {
    if (!vodSearch.trim()) return vodRecommendations;
    const q = vodSearch.toLowerCase();
    return vodRecommendations.filter(r =>
      r.name.toLowerCase().includes(q) || r.group_title?.toLowerCase().includes(q)
    );
  }, [vodRecommendations, vodSearch]);

  // Compute recommendations from relatedItems prop or fetch lazily
  useEffect(() => {
    if (!item || !isVod) { setVodRecommendations([]); return; }

    // If parent passed relatedItems, filter in-memory (instant)
    if (relatedItems?.length) {
      const recs = relatedItems
        .filter(r => r.id !== item.id)
        .slice(0, 30);
      setVodRecommendations(recs);
      return;
    }

    // Otherwise fetch from API — non-blocking, after a short delay to not compete with video
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!item.group_title) return;
      setVodRecsLoading(true);
      try {
        const params = new URLSearchParams({
          type: item.content_type,
          group: item.group_title,
          limit: '30',
        });
        const res = await fetch(`/api/browse?${params}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          const items = (data.items || []) as PlaylistItem[];
          setVodRecommendations(items.filter(r => r.id !== item.id).slice(0, 30));
        }
      } catch { /* non-critical */ }
      if (!cancelled) setVodRecsLoading(false);
    }, 800); // Delay to prioritize video startup

    return () => { cancelled = true; clearTimeout(timer); };
  }, [item, isVod, relatedItems]);

  // Auto-enlarge for VOD so side panel has room
  useEffect(() => {
    if (isVod && viewMode === 'normal') setViewMode('large');
  }, [isVod]);

  /* ── Thumbnail preview: hidden seekable video for real frame capture ── */
  // IMPORTANT: Defer until main video is loaded to avoid competing connections.
  useEffect(() => {
    if (!item || !mainVideoLoaded) return;
    const THUMB_W = 192;
    const THUMB_H = 108;
    const THUMB_BUCKET = 2;
    let cancelled = false;

    thumbnailCacheRef.current.clear();
    thumbSeekingRef.current = false;
    thumbLastSeekRef.current = null;
    setSeekPreviewThumb(null);

    // Create canvas once
    if (!thumbCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = THUMB_W;
      c.height = THUMB_H;
      thumbCanvasRef.current = c;
    }

    // Create hidden video for thumbnail seeking
    const tv = document.createElement('video');
    tv.crossOrigin = 'anonymous';
    tv.preload = 'metadata';
    tv.muted = true;
    tv.playsInline = true;
    tv.style.position = 'fixed';
    tv.style.width = '1px';
    tv.style.height = '1px';
    tv.style.opacity = '0';
    tv.style.left = '-9999px';
    tv.style.top = '-9999px';
    tv.style.pointerEvents = 'none';
    document.body.appendChild(tv);
    thumbVideoRef.current = tv;

    // Capture frame when seeked
    const canvas = thumbCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const onSeeked = () => {
      if (!ctx || cancelled) {
        thumbSeekingRef.current = false;
        return;
      }
      try {
        ctx.drawImage(tv, 0, 0, THUMB_W, THUMB_H);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        const t = Math.max(0, Math.floor(tv.currentTime / THUMB_BUCKET) * THUMB_BUCKET);
        thumbnailCacheRef.current.set(t, dataUrl);
        setSeekPreviewThumb(dataUrl);
      } catch { /* CORS issue */ }
      thumbSeekingRef.current = false;
    };
    const onError = () => {
      thumbSeekingRef.current = false;
    };
    tv.addEventListener('seeked', onSeeked);
    tv.addEventListener('error', onError);

    const url = resolveStreamUrl(item, activeEpisode?.streamUrl);
    const proxied = proxyUrl(url);
    const isHlsStream =
      url.includes('.m3u8') ||
      url.includes('/live/') ||
      url.includes('/hls/') ||
      item.content_type === 'channel';

    void (async () => {
      try {
        if (isHlsStream) {
          // Safari can seek native HLS directly.
          if (tv.canPlayType('application/vnd.apple.mpegurl')) {
            tv.src = proxied;
            tv.load();
            return;
          }

          // Other browsers: attach a dedicated lightweight HLS instance for thumbnail seeks.
          const Hls = (await getHlsModule()).default;
          if (cancelled) return;
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false,
              startLevel: 0,
              maxBufferLength: 8,
              maxMaxBufferLength: 20,
              backBufferLength: 0,
              fragLoadingTimeOut: 8000,
              levelLoadingTimeOut: 8000,
              manifestLoadingTimeOut: 8000,
              fragLoadingMaxRetry: 2,
              manifestLoadingMaxRetry: 2,
            });
            thumbHlsRef.current = hls;
            hls.loadSource(proxied);
            hls.attachMedia(tv);
          } else {
            tv.src = proxied;
            tv.load();
          }
        } else {
          tv.src = proxied;
          tv.load();
        }
      } catch {
        thumbSeekingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      tv.removeEventListener('seeked', onSeeked);
      tv.removeEventListener('error', onError);
      thumbHlsRef.current?.destroy();
      thumbHlsRef.current = null;
      tv.pause();
      tv.removeAttribute('src');
      tv.load();
      if (tv.parentNode) tv.parentNode.removeChild(tv);
      thumbVideoRef.current = null;
      thumbSeekingRef.current = false;
      thumbLastSeekRef.current = null;
    };
  }, [item, activeEpisode, mainVideoLoaded]);

  // Also capture from main video during playback (for HLS streams)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const THUMB_W = 192;
    const THUMB_H = 108;
    const INTERVAL = 10;
    if (!thumbCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = THUMB_W;
      c.height = THUMB_H;
      thumbCanvasRef.current = c;
    }
    const canvas = thumbCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cache = thumbnailCacheRef.current;
    const capture = () => {
      if (video.paused || video.ended || !video.videoWidth || video.readyState < 2) return;
      const t = Math.round(video.currentTime / INTERVAL) * INTERVAL;
      if (cache.has(t)) return;
      try {
        ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
        cache.set(t, canvas.toDataURL('image/jpeg', 0.5));
      } catch { /* tainted */ }
    };
    capture();
    const timer = setInterval(capture, 2000);
    return () => clearInterval(timer);
  }, [duration, playing]);

  const navigateChannel = useCallback((target: PlaylistItem) => {
    onNavigate?.(target);
  }, [onNavigate]);

  const isLive = item?.content_type === 'channel' ||
    item?.stream_url.includes('/live/') || false;
  const isSeries = item ? isXtreamSeriesUrl(item) : false;

  /* ── Controls visibility ── */
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
        setSettingsPanel(null);
      }
    }, 3500);
  }, []);

  /* ── Fetch series episodes ── */
  useEffect(() => {
    if (!item || !isSeries) return;
    setSeriesLoading(true);
    setSeriesEpisodes(null);
    setActiveEpisode(null);

    const xtream = extractXtreamInfo(item.stream_url);

    /** Client-side direct Xtream API call (uses user's residential IP — bypasses datacenter blocks) */
    async function fetchSeriesDirectly(): Promise<typeof seriesEpisodes> {
      if (!xtream) return null;
      // Try HTTPS first (avoids mixed content on HTTPS sites), then HTTP
      const bases = xtream.baseUrl.startsWith('http://')
        ? [xtream.baseUrl.replace('http://', 'https://'), xtream.baseUrl]
        : [xtream.baseUrl];

      for (const base of bases) {
        try {
          const apiUrl = `${base}/player_api.php?username=${encodeURIComponent(xtream.username)}&password=${encodeURIComponent(xtream.password)}&action=get_series_info&series_id=${xtream.id}`;
          const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) continue;
          const data = await res.json();
          const episodes = data.episodes;
          if (!episodes || typeof episodes !== 'object') continue;
          const seasons: { season: number; episodes: { id: string; title: string; season: number; episode: number; streamUrl: string }[] }[] = [];
          for (const [seasonNum, eps] of Object.entries(episodes)) {
            if (!Array.isArray(eps)) continue;
            seasons.push({
              season: parseInt(seasonNum) || 0,
              episodes: (eps as Array<{ id?: string; title?: string; episode_num?: number; season?: number; container_extension?: string }>).map((ep) => ({
                id: String(ep.id || ''),
                title: ep.title || `Episode ${ep.episode_num || '?'}`,
                season: ep.season || parseInt(seasonNum) || 0,
                episode: ep.episode_num || 0,
                streamUrl: `${xtream!.baseUrl}/series/${encodeURIComponent(xtream!.username)}/${encodeURIComponent(xtream!.password)}/${ep.id}.${ep.container_extension || 'mp4'}`,
              })),
            });
          }
          seasons.sort((a, b) => a.season - b.season);
          if (seasons.length > 0) {
            return { seriesName: (data.info as Record<string, unknown>)?.name as string || '', seasons };
          }
        } catch { /* try next base URL */ }
      }
      return null;
    }

    (async () => {
      let data: typeof seriesEpisodes = null;

      // Strategy 1: Server-side proxy (works when scanner is available)
      try {
        const res = await fetch(`/api/series-episodes?url=${encodeURIComponent(item.stream_url)}`);
        if (res.ok) data = await res.json();
      } catch { /* server proxy failed */ }

      // Strategy 2: Direct client-side fetch (user's residential IP — bypasses datacenter IP blocks)
      if (!data) {
        try { data = await fetchSeriesDirectly(); } catch { /* CORS or network error */ }
      }

      if (data && data.seasons.length > 0) {
        setSeriesEpisodes(data);
        setSeriesLoading(false);
        setSelectedSeason(data.seasons[0].season);
        const firstEp = data.seasons[0].episodes[0];
        if (firstEp) setActiveEpisode({ streamUrl: firstEp.streamUrl, title: firstEp.title });
      } else {
        // Episode fetching failed (both server & client) — play series URL directly
        setSeriesLoading(false);
        setActiveEpisode({ streamUrl: item.stream_url, title: item.name });
      }
    })();
  }, [item, isSeries]);

  /* ── Save position periodically ── */
  useEffect(() => {
    if (!item || isLive) return;
    const url = resolveStreamUrl(item, activeEpisode?.streamUrl);
    saveTimerRef.current = setInterval(() => {
      const v = videoRef.current;
      if (v && v.currentTime > 5 && v.duration > 60) {
        savePosition(url, v.currentTime);
      }
    }, 5000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [item, isLive, activeEpisode]);

  /* ── Init player ── */
  useEffect(() => {
    if (!item) return;
    if (isSeries && !activeEpisode) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    setError(null);
    setLoading(true);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setMainVideoLoaded(false);
    initInProgressRef.current = true;

    const video = videoRef.current;
    if (!video) return;

    const url = resolveStreamUrl(item, activeEpisode?.streamUrl);
    const proxied = proxyUrl(url);

    const isHls =
      url.includes('.m3u8') ||
      url.includes('/live/') ||
      url.includes('/hls/') ||
      item.content_type === 'channel';

    // Detect Xtream VOD URLs — these support HLS conversion (.m3u8)
    const isXtreamVod = !isHls && /\/(movie|series)\/[^/]+\/[^/]+\/\d+\.\w+$/.test(url);

    /** Attach hls.js to a video element and wait for manifest or fatal error. */
    async function attachHls(
      vid: HTMLVideoElement,
      source: string,
      opts: { live: boolean; timeoutMs?: number },
    ): Promise<boolean> {
      const Hls = (await getHlsModule()).default;
      if (!Hls.isSupported()) return false;

      return new Promise<boolean>((resolve) => {
        let settled = false;
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: opts.live,
          startLevel: opts.live ? 0 : -1,
          maxBufferLength: opts.live ? 4 : 60,
          maxMaxBufferLength: opts.live ? 15 : 240,
          backBufferLength: opts.live ? 0 : 60,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 4,
          liveDurationInfinity: opts.live,
          fragLoadingTimeOut: 10000,
          fragLoadingMaxRetry: 3,
          fragLoadingRetryDelay: 500,
          levelLoadingTimeOut: 8000,
          manifestLoadingTimeOut: 8000,
          manifestLoadingMaxRetry: 2,
          manifestLoadingRetryDelay: 500,
          startFragPrefetch: true,
          testBandwidth: !opts.live,
          capLevelToPlayerSize: false,
          maxBufferHole: 1.0,
          nudgeMaxRetry: 5,
          abrEwmaDefaultEstimate: 5000000,
          progressive: true,
          highBufferWatchdogPeriod: 2,
        });

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          hls.destroy();
          resolve(false);
        }, opts.timeoutMs ?? 12000);

        hls.on(Hls.Events.MANIFEST_PARSED, async (_: unknown, data: { levels: { height: number; width: number; bitrate: number }[] }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          hlsRef.current = hls;
          setLoading(false);
          setMainVideoLoaded(true);
          initInProgressRef.current = false;

          if (data.levels && data.levels.length > 1) {
            const q = data.levels.map((lvl, i) => ({
              height: lvl.height,
              label: lvl.height >= 4320 ? '8K' :
                     lvl.height >= 2160 ? '4K' :
                     lvl.height >= 1440 ? '1440p' :
                     lvl.height >= 1080 ? '1080p' :
                     lvl.height >= 720 ? '720p' :
                     lvl.height >= 480 ? '480p' :
                     lvl.height >= 360 ? '360p' : `${lvl.height}p`,
              index: i,
            })).sort((a, b) => b.height - a.height);
            setQualities(q);
            if (opts.live) {
              hls.currentLevel = -1;
              setCurrentQuality(-1);
            } else {
              hls.currentLevel = q[0].index;
              setCurrentQuality(q[0].index);
            }
          }
          try { await vid.play(); } catch { /* user presses play */ }
          resolve(true);
        });

        let mediaErrorRecoveries = 0;
        let networkErrorRecoveries = 0;
        hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; type: string; details: string }) => {
          if (data.fatal) {
            if (data.type === 'mediaError' && mediaErrorRecoveries < 3) {
              mediaErrorRecoveries++;
              hls.recoverMediaError();
            } else if (data.type === 'networkError' && networkErrorRecoveries < 3) {
              networkErrorRecoveries++;
              setTimeout(() => { hls.startLoad(); }, 1000 * networkErrorRecoveries);
            } else {
              if (!settled) { settled = true; clearTimeout(timer); hls.destroy(); resolve(false); }
            }
          }
          if (!data.fatal && data.details === 'bufferStalledError' && vid) {
            const ct = vid.currentTime;
            if (ct > 0) vid.currentTime = ct + 0.1;
          }
        });

        hls.loadSource(source);
        hls.attachMedia(vid);
      });
    }

    async function initPlayer() {
      if (!video) return;
      video.playbackRate = 1;

      const proxied = proxyUrl(url);
      const proxiedHls = proxyUrl(url.replace(/\.\w+$/, '.m3u8'));

      // ── HLS streams (live channels, .m3u8 URLs) ──
      if (isHls) {
        // Safari native HLS
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = proxied;
          video.load();
          try { await video.play(); } catch { /* user presses play */ }
          setLoading(false);
          setMainVideoLoaded(true);
          initInProgressRef.current = false;
          return;
        }
        // Chrome/Firefox — use hls.js
        if (await attachHls(video, proxied, { live: isLive, timeoutMs: 15000 })) return;
        setError('تعذّر تشغيل البث.');
        setLoading(false);
        initInProgressRef.current = false;
        return;
      }

      // ── Xtream VOD: try HLS with hls.js first (faster + works on all browsers) ──
      if (isXtreamVod) {
        if (await attachHls(video, proxiedHls, { live: false, timeoutMs: 12000 })) return;
        // HLS failed — fall through to direct MP4
      }

      // ── VOD/MP4 — direct proxy ──
      if (await tryVideoUrl(video, proxied, 15000)) {
        try { await video.play(); } catch { /* user presses play */ }
        setLoading(false);
        setMainVideoLoaded(true);
        initInProgressRef.current = false;
        return;
      }

      // ── Non-Xtream VOD: try HLS conversion as last resort ──
      if (!isXtreamVod && /\.(mp4|mkv|avi|ts)(\?|$)/i.test(url)) {
        if (await attachHls(video, proxiedHls, { live: false, timeoutMs: 10000 })) return;
      }

      setError('تعذّر تشغيل الفيديو. جرّب فتحه في VLC.');
      setLoading(false);
      initInProgressRef.current = false;
    }

    void initPlayer();

    return () => {
      initInProgressRef.current = false;
      if (video && video.currentTime > 5 && video.duration > 60 && !isLive) {
        savePosition(url, video.currentTime);
      }
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [item, isLive, isSeries, activeEpisode]);

  /* ── Video event handlers ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => { setPlaying(false); setShowControls(true); };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => setDuration(video.duration);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onEnded = () => {
      setPlaying(false);
      setShowControls(true);
      if (item && !isLive) clearPosition(resolveStreamUrl(item, activeEpisode?.streamUrl));
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => { setLoading(false); setMainVideoLoaded(true); };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [item, isLive]);

  /* ── Fullscreen ── */
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (!el) return;
    const isFs = !!(document.fullscreenElement || doc.webkitFullscreenElement);
    void (async () => {
      try {
        if (isFs) {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (doc.webkitExitFullscreen) {
            await doc.webkitExitFullscreen();
          }
        } else if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
      } catch {
        // Ignore gesture/API failures and keep player usable.
      }
    })();
  }, []);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const onChange = () => setFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);

  /* ── PiP ── */
  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch { /* PiP not supported */ }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnterPip = () => setPip(true);
    const onLeavePip = () => setPip(false);
    video.addEventListener('enterpictureinpicture', onEnterPip);
    video.addEventListener('leavepictureinpicture', onLeavePip);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip);
      video.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case 'Escape': onClose(); break;
        case ' ':
        case 'k':
          e.preventDefault();
          if (video.paused) { video.play(); } else { video.pause(); }
          showControlsTemporarily();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          video.muted = !video.muted;
          break;
        case 'p':
          e.preventDefault();
          togglePip();
          break;
        case 't':
          e.preventDefault();
          cycleViewMode();
          break;
        case 'n':
        case ']':
          e.preventDefault();
          if (nextChannel) navigateChannel(nextChannel);
          break;
        case 'b':
        case '[':
          e.preventDefault();
          if (prevChannel) navigateChannel(prevChannel);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          showControlsTemporarily();
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
          showControlsTemporarily();
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          showControlsTemporarily();
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          showControlsTemporarily();
          break;
        case 'j':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          showControlsTemporarily();
          break;
        case 'l':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
          showControlsTemporarily();
          break;
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
          e.preventDefault();
          if (duration > 0) {
            video.currentTime = (duration * parseInt(e.key)) / 10;
            showControlsTemporarily();
          }
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, duration, showControlsTemporarily, toggleFullscreen, togglePip, prevChannel, nextChannel, navigateChannel, cycleViewMode]);

  /* ── Seek on progress bar ── */
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * duration;
  }, [duration]);

  const handleProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * duration;
    const bucket = Math.max(0, Math.floor(time / 2) * 2);
    setSeekPreview(time);
    setSeekPreviewPos({ x: rect.left + pct * rect.width, y: rect.top });

    // Check cache first (exact second match + nearby)
    const cache = thumbnailCacheRef.current;
    const thumb = cache.get(bucket)
      || cache.get(bucket - 2) || cache.get(bucket + 2)
      || cache.get(bucket - 4) || cache.get(bucket + 4)
      || cache.get(bucket - 6) || cache.get(bucket + 6);

    if (thumb) {
      setSeekPreviewThumb(thumb);
    } else {
      // Seek hidden video to generate a real frame on-demand.
      const tv = thumbVideoRef.current;
      if (tv && !thumbSeekingRef.current && tv.readyState >= 1 && thumbLastSeekRef.current !== bucket) {
        thumbSeekingRef.current = true;
        thumbLastSeekRef.current = bucket;
        const seekTime = Number.isFinite(tv.duration) && tv.duration > 0
          ? Math.max(0, Math.min(bucket, tv.duration - 0.05))
          : bucket;
        try {
          tv.currentTime = seekTime;
        } catch {
          thumbSeekingRef.current = false;
        }
      }
    }
  }, [duration]);

  const clearSeekPreview = useCallback(() => {
    setSeekPreview(null);
    setSeekPreviewThumb(null);
    setSeekPreviewPos(null);
  }, []);

  /* ── Actions ── */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); } else { video.pause(); }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + delta));
    showControlsTemporarily();
    if (seekIndicatorTimer.current) clearTimeout(seekIndicatorTimer.current);
    setSeekIndicator({ side: delta > 0 ? 'right' : 'left', seconds: Math.abs(delta) });
    seekIndicatorTimer.current = setTimeout(() => setSeekIndicator(null), 700);
  };

  const changeSpeed = (s: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = s;
    setSpeed(s);
    setSettingsPanel(null);
  };

  const changeQuality = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = levelIndex;
    setCurrentQuality(levelIndex);
    setSettingsPanel(null);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = parseFloat(e.target.value);
    video.volume = v;
    video.muted = v === 0;
  };

  if (!item) return null;

  const streamUrl = resolveStreamUrl(item, activeEpisode?.streamUrl);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const displayName = activeEpisode?.title || item.name;
  const hasLiveSide = hasNavigation;
  const hasVodSide = isVod && (vodRecommendations.length > 0 || vodRecsLoading);
  const hasSideContent = !fullscreen && (hasLiveSide || hasVodSide);
  const sideVisible = hasSideContent && showSidePanel;

  const containerClass =
    !isVod
      ? (fullscreen ? 'w-screen h-screen' : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 py-5')
      : fullscreen ? 'w-screen h-screen'
      : viewMode === 'theater' ? 'w-[calc(100vw-32px)] max-w-[100vw] h-[calc(100vh-60px)]'
      : viewMode === 'large' ? 'w-full max-w-[1400px] mx-4'
      : 'w-full max-w-[1100px] mx-4';

  function cycleViewMode() {
    const modes: ViewMode[] = ['normal', 'large', 'theater'];
    const idx = modes.indexOf(viewMode);
    setViewMode(modes[(idx + 1) % modes.length]);
  }

  function copyUrl() {
    void navigator.clipboard.writeText(streamUrl);
    toast.success('Stream URL copied');
  }

  /* ── VOD full-page layout vs Live dark overlay ── */
  const isVodPage = isVod;

  return (
    <div
      className={`fixed inset-0 z-50 ${
        isVodPage
          ? fullscreen ? 'bg-black' : 'bg-background overflow-y-auto'
          : fullscreen ? 'bg-black' : 'bg-background overflow-y-auto'
      }`}
      onClick={(e) => { if (e.target === e.currentTarget && !isVodPage) onClose(); }}
    >
      {/* ═══ VOD: Full-page premium layout ═══ */}
      {isVodPage ? (
        <div className={`flex flex-col ${fullscreen ? 'h-screen' : 'min-h-screen'}`}>
          {/* ── Premium Header (hidden in fullscreen) ── */}
          <header className={`sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40 ${fullscreen ? 'hidden' : ''}`}>
            <div className="max-w-[1800px] mx-auto flex items-center gap-4 px-4 sm:px-6 h-14">
              {/* Left: Brand + Back */}
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={onClose} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1.5 hover:bg-foreground/[0.04]">
                  <ChevronLeft className="h-4 w-4" />
                  <span className="text-sm font-medium hidden sm:inline">Back</span>
                </button>
                <div className="h-5 w-px bg-border/50" />
                <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
                    <Play className="h-3 w-3 text-primary-foreground fill-primary-foreground ml-[1px]" />
                  </div>
                  <span className="text-sm font-bold text-foreground tracking-tight hidden md:inline">PlaylistHub</span>
                </a>
              </div>

              {/* Center: Search Bar */}
              <div className="flex-1 max-w-xl mx-auto">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 group-focus-within:text-foreground/60 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search recommendations..."
                    value={vodSearch}
                    onChange={(e) => setVodSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-9 rounded-full bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-border focus:bg-muted/80 transition-all"
                  />
                  {vodSearch && (
                    <button
                      onClick={() => setVodSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => {
                  void navigator.clipboard.writeText(window.location.origin);
                  toast.success('Link copied');
                }} title="Share"
                  className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-all">
                  <Share2 className="h-4 w-4" />
                </button>
                <button onClick={copyUrl} title="Copy stream URL"
                  className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-all">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          {/* ── Main content area ── */}
          <div className={`flex-1 ${fullscreen ? 'flex items-center justify-center' : 'max-w-[1800px] w-full mx-auto px-4 sm:px-6 py-5'}`}>
            <div className={`flex gap-6 ${fullscreen ? 'w-full h-full' : ''}`}>
              {/* ── Left: Player + Metadata ── */}
              <div className={`flex-1 min-w-0 ${fullscreen ? 'flex items-center justify-center' : ''}`}>
                {/* Player container — always dark */}
                <div
                  ref={containerRef}
                  className={`relative bg-black overflow-hidden ${
                    fullscreen ? 'w-screen h-screen' : 'rounded-2xl shadow-2xl shadow-black/20 ring-1 ring-white/[0.05]'
                  }`}
                  onMouseMove={showControlsTemporarily}
                  onMouseLeave={() => { if (playing) { setShowControls(false); setSettingsPanel(null); } }}
                >
                  <div className={`relative ${fullscreen ? 'w-full h-full' : 'aspect-video'}`}>
                    {/* Video */}
                    <video
                      ref={videoRef}
                      crossOrigin="anonymous"
                      className="w-full h-full object-contain"
                      playsInline
                      autoPlay
                      preload="auto"
                      onError={() => {
                        if (hlsRef.current || initInProgressRef.current) return;
                        setError('Video could not be played. Try opening in VLC.');
                        setLoading(false);
                      }}
                    />

                    {/* Loading */}
                    {loading && (
                      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-white/80 animate-spin" />
                      </div>
                    )}

                    {/* Big play button */}
                    {!playing && !loading && !error && (
                      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                        <div className="w-20 h-20 rounded-full bg-white/[0.12] backdrop-blur-sm flex items-center justify-center">
                          <Play className="h-9 w-9 text-white fill-white ml-1" />
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {error && !seriesLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-white/80 p-8 text-center z-20">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                          <AlertCircle className="h-8 w-8 text-red-400" />
                        </div>
                        <div>
                          <p className="text-base font-medium text-white/90 mb-1">Playback Error</p>
                          <p className="text-sm text-white/50">{error}</p>
                        </div>
                        <button onClick={copyUrl}
                          className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-5 py-2.5 text-sm text-white hover:bg-white/[0.12] transition-colors border border-white/[0.06]">
                          <Copy className="h-4 w-4" /> Copy URL
                        </button>
                      </div>
                    )}

                    {/* Series loading */}
                    {seriesLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                        <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/80 animate-spin mb-4" />
                        <p className="text-sm text-white/50">Loading episodes...</p>
                      </div>
                    )}

                    {/* Series episode selector */}
                    {isSeries && seriesEpisodes && !seriesLoading && (
                      <div className="player-overlay absolute top-0 right-0 bottom-0 w-72 z-30 bg-black/90 backdrop-blur-xl border-l border-white/[0.06] overflow-hidden flex flex-col">
                        <div className="shrink-0 p-4 border-b border-white/[0.06]">
                          <p className="text-white text-sm font-semibold truncate">{seriesEpisodes.seriesName || item.name}</p>
                          {seriesEpisodes.seasons.length > 1 && (
                            <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-none">
                              {seriesEpisodes.seasons.map((s) => (
                                <button
                                  key={s.season}
                                  onClick={() => setSelectedSeason(s.season)}
                                  className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all ${
                                    selectedSeason === s.season
                                      ? 'bg-white text-black font-semibold'
                                      : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70'
                                  }`}
                                >
                                  Season {s.season}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 overflow-y-auto scrollbar-none p-2">
                          {seriesEpisodes.seasons
                            .find(s => s.season === selectedSeason)
                            ?.episodes.map((ep) => (
                              <button
                                key={ep.id}
                                onClick={() => setActiveEpisode({ streamUrl: ep.streamUrl, title: ep.title })}
                                className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm transition-all ${
                                  activeEpisode?.streamUrl === ep.streamUrl
                                    ? 'bg-white/[0.1] text-white border border-white/[0.1]'
                                    : 'text-white/60 hover:bg-white/[0.05] hover:text-white/80 border border-transparent'
                                }`}
                              >
                                <span className="text-white/30 text-xs mr-2 tabular-nums">E{ep.episode}</span>
                                <span className="truncate">{ep.title}</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Seek indicator */}
                    {seekIndicator && (
                      <div className={`absolute top-1/2 -translate-y-1/2 z-20 pointer-events-none ${
                        seekIndicator.side === 'left' ? 'left-[15%]' : 'right-[15%]'
                      }`}>
                        <div className="flex flex-col items-center animate-pulse">
                          <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                            {seekIndicator.side === 'left' ? (
                              <SkipBack className="h-6 w-6 text-white" />
                            ) : (
                              <SkipForward className="h-6 w-6 text-white" />
                            )}
                          </div>
                          <span className="text-white text-xs mt-1.5 font-medium">{seekIndicator.seconds}s</span>
                        </div>
                      </div>
                    )}

                    {/* Click to play/pause & double-click fullscreen */}
                    <div
                      className="absolute inset-0 z-[5]"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('.player-controls, .player-overlay')) return;
                        togglePlay();
                        showControlsTemporarily();
                      }}
                      onDoubleClick={(e) => {
                        if ((e.target as HTMLElement).closest('.player-controls, .player-overlay')) return;
                        toggleFullscreen();
                      }}
                    />

                    {/* ── Bottom controls overlay (dark, inside player) ── */}
                    <div
                      className={`player-controls absolute bottom-0 left-0 right-0 z-20 transition-all duration-500 ease-out ${
                        showControls || !playing ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                      }`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

                      <div className="relative px-4 pb-4 pt-16">
                        {/* Progress bar */}
                        {!isLive && duration > 0 && (
                          <div
                            ref={progressRef}
                            className="group relative h-[3px] hover:h-[5px] bg-white/[0.15] rounded-full cursor-pointer mb-4 transition-all duration-200"
                            onClick={handleProgressClick}
                            onMouseMove={handleProgressHover}
                            onMouseLeave={clearSeekPreview}
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-white/[0.2] rounded-full transition-[width] duration-300"
                              style={{ width: `${bufferedPct}%` }}
                            />
                            <div
                              className="absolute inset-y-0 left-0 bg-white rounded-full transition-[width] duration-100"
                              style={{ width: `${progress}%` }}
                            />
                            <div
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[13px] h-[13px] bg-white rounded-full scale-0 group-hover:scale-100 transition-transform duration-150 shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                              style={{ left: `${progress}%` }}
                            />
                          </div>
                        )}

                        {/* Controls row */}
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            className="p-2 text-white hover:scale-110 transition-transform">
                            {playing
                              ? <Pause className="h-5 w-5 fill-white" />
                              : <Play className="h-5 w-5 fill-white" />
                            }
                          </button>

                          <button onClick={(e) => { e.stopPropagation(); seek(-10); }}
                            title="-10s (J)"
                            className="p-2 text-white/60 hover:text-white transition-colors">
                            <SkipBack className="h-4 w-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); seek(10); }}
                            title="+10s (L)"
                            className="p-2 text-white/60 hover:text-white transition-colors">
                            <SkipForward className="h-4 w-4" />
                          </button>

                          {/* Volume group */}
                          <div className="flex items-center group/vol">
                            <button onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                              className="p-2 text-white/60 hover:text-white transition-colors">
                              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                            </button>
                            <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300">
                              <input
                                type="range"
                                min={0} max={1} step={0.05}
                                value={muted ? 0 : volume}
                                onChange={handleVolumeChange}
                                onClick={(e) => e.stopPropagation()}
                                className="w-20 h-1 accent-white cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Time */}
                          <div className="text-white/50 text-xs font-mono ml-1 select-none tabular-nums">
                            <span className="text-white/80">{formatTime(currentTime)}</span>
                            {duration > 0 && <span className="text-white/30"> / {formatTime(duration)}</span>}
                          </div>

                          <div className="flex-1" />

                          {/* Settings */}
                          <div className="relative">
                            <button onClick={(e) => { e.stopPropagation(); setSettingsPanel(settingsPanel ? null : 'main'); }}
                              className={`p-2 transition-all ${
                                settingsPanel ? 'text-white rotate-45' : speed !== 1 ? 'text-white' : 'text-white/50 hover:text-white'
                              }`}
                              title="Settings">
                              <Settings className="h-4 w-4" />
                            </button>

                            {settingsPanel && (
                              <div className="absolute bottom-full right-0 mb-3 w-52 bg-[#1a1a1e]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl"
                                onClick={(e) => e.stopPropagation()}>
                                {settingsPanel === 'main' && (
                                  <div className="py-1">
                                    <button onClick={() => setSettingsPanel('quality')}
                                      className="flex items-center justify-between w-full px-4 py-3 text-[13px] text-white hover:bg-white/[0.06] transition-colors">
                                      <span className="flex items-center gap-3">
                                        <MonitorPlay className="h-4 w-4 text-white/40" />
                                        Quality
                                      </span>
                                      <span className="text-[12px] text-white/40">
                                        {currentQuality === -1 ? 'Auto' : qualities.find(q => q.index === currentQuality)?.label || 'Auto'}
                                      </span>
                                    </button>
                                    <button onClick={() => setSettingsPanel('speed')}
                                      className="flex items-center justify-between w-full px-4 py-3 text-[13px] text-white hover:bg-white/[0.06] transition-colors">
                                      <span className="flex items-center gap-3">
                                        <Settings className="h-4 w-4 text-white/40" />
                                        Playback Speed
                                      </span>
                                      <span className="text-[12px] text-white/40">{speed === 1 ? 'Normal' : `${speed}x`}</span>
                                    </button>
                                  </div>
                                )}
                                {settingsPanel === 'quality' && (
                                  <div>
                                    <button onClick={() => setSettingsPanel('main')}
                                      className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-white/50 border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                                      <ChevronLeft className="h-3 w-3" /> Quality
                                    </button>
                                    <div className="py-1">
                                      <button onClick={() => changeQuality(-1)}
                                        className={`flex items-center justify-between w-full px-4 py-2.5 text-[13px] hover:bg-white/[0.06] transition-colors ${
                                          currentQuality === -1 ? 'text-white font-medium' : 'text-white/70'
                                        }`}>
                                        Auto
                                        {currentQuality === -1 && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                      </button>
                                      {qualities.map((q) => (
                                        <button key={q.index} onClick={() => changeQuality(q.index)}
                                          className={`flex items-center justify-between w-full px-4 py-2.5 text-[13px] hover:bg-white/[0.06] transition-colors ${
                                            currentQuality === q.index ? 'text-white font-medium' : 'text-white/70'
                                          }`}>
                                          <span className="flex items-center gap-2">
                                            {q.label}
                                            {q.height >= 1080 && <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded font-bold">HD</span>}
                                          </span>
                                          {currentQuality === q.index && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </button>
                                      ))}
                                      {qualities.length === 0 && (
                                        <div className="px-4 py-3 text-xs text-white/30">Single quality stream</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {settingsPanel === 'speed' && (
                                  <div>
                                    <button onClick={() => setSettingsPanel('main')}
                                      className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-white/50 border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                                      <ChevronLeft className="h-3 w-3" /> Speed
                                    </button>
                                    <div className="py-1">
                                      {SPEEDS.map((s) => (
                                        <button key={s} onClick={() => changeSpeed(s)}
                                          className={`flex items-center justify-between w-full px-4 py-2.5 text-[13px] hover:bg-white/[0.06] transition-colors ${
                                            speed === s ? 'text-white font-medium' : 'text-white/70'
                                          }`}>
                                          {s === 1 ? 'Normal' : `${s}x`}
                                          {speed === s && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* PiP */}
                          {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                            <button onClick={(e) => { e.stopPropagation(); togglePip(); }}
                              className={`p-2 transition-all ${pip ? 'text-white' : 'text-white/50 hover:text-white'}`}
                              title="Picture-in-Picture (P)">
                              <PictureInPicture2 className="h-4 w-4" />
                            </button>
                          )}

                          {/* Fullscreen */}
                          <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                            className="p-2 text-white/50 hover:text-white transition-colors"
                            title={fullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}>
                            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Premium Metadata Section ── */}
                {!fullscreen && (
                <div className="mt-4 space-y-4">
                  {/* Title + Actions row */}
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-semibold text-foreground leading-tight line-clamp-2">
                        {displayName}
                      </h2>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {item.group_title && (
                          <span className="text-sm text-muted-foreground font-medium">{item.group_title}</span>
                        )}
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                        <span className="text-xs text-muted-foreground capitalize">{item.content_type}</span>
                        {duration > 0 && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatTime(duration)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action bar */}
                  <div className="flex items-center gap-2 pb-1">
                    <button onClick={copyUrl}
                      className="flex items-center gap-2 rounded-full bg-primary hover:opacity-90 px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity">
                      <Copy className="h-3.5 w-3.5" /> Copy URL
                    </button>
                    <button onClick={() => {
                      void navigator.clipboard.writeText(window.location.origin);
                      toast.success('Link copied');
                    }}
                      className="flex items-center gap-2 rounded-full bg-secondary hover:bg-secondary/80 px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors">
                      <Share2 className="h-3.5 w-3.5" /> Share
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-border/50" />
                </div>
                )}
              </div>

              {/* ── Right: Recommendation Column ── */}
              {sideVisible && !fullscreen && (
                <div className="w-[380px] shrink-0 hidden lg:block">
                  <div className="sticky top-[72px]">
                    {/* Section header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {item.content_type === 'movie'
                          ? <Film className="h-4 w-4 text-muted-foreground" />
                          : <Clapperboard className="h-4 w-4 text-muted-foreground" />
                        }
                        <span className="text-sm font-semibold text-foreground">More Like This</span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {filteredRecommendations.length}{vodSearch ? ` / ${vodRecommendations.length}` : ''} titles
                      </span>
                    </div>

                    {/* Recommendation list */}
                    <div className="max-h-[calc(100vh-140px)] overflow-y-auto scrollbar-none space-y-0.5 -mx-1">
                      {/* Loading skeletons */}
                      {vodRecsLoading && vodRecommendations.length === 0 && (
                        <div className="space-y-3 px-1">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex gap-3 animate-pulse">
                              <div className="w-[168px] aspect-video rounded-lg bg-muted shrink-0" />
                              <div className="flex-1 py-1 space-y-2">
                                <div className="h-3 bg-muted rounded w-4/5" />
                                <div className="h-2.5 bg-muted/70 rounded w-3/5" />
                                <div className="h-2 bg-muted/50 rounded w-2/5" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Filtered cards */}
                      {filteredRecommendations.length > 0 && (
                        <div className="space-y-0.5 px-1">
                          {filteredRecommendations.map((rec) => (
                            <VodRecommendationCard
                              key={rec.id}
                              item={rec}
                              onPlay={() => onNavigate ? onNavigate(rec) : undefined}
                            />
                          ))}
                        </div>
                      )}

                      {/* Empty state */}
                      {!vodRecsLoading && filteredRecommendations.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            {vodSearch ? <Search className="h-5 w-5 text-muted-foreground/40" /> : <Film className="h-5 w-5 text-muted-foreground/40" />}
                          </div>
                          <p className="text-sm text-muted-foreground/60">
                            {vodSearch ? `No results for "${vodSearch}"` : 'No recommendations available'}
                          </p>
                          {vodSearch && (
                            <button onClick={() => setVodSearch('')} className="text-xs text-primary hover:underline mt-2">
                              Clear search
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
      <>
      {!fullscreen && (
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40">
          <div className="max-w-[1800px] mx-auto flex items-center gap-4 px-4 sm:px-6 h-14">
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={onClose} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1.5 hover:bg-foreground/[0.04]">
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm font-medium hidden sm:inline">Back</span>
              </button>
              <div className="h-5 w-px bg-border/50" />
              <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
                  <Play className="h-3 w-3 text-primary-foreground fill-primary-foreground ml-[1px]" />
                </div>
                <span className="text-sm font-bold text-foreground tracking-tight hidden md:inline">PlaylistHub</span>
              </a>
            </div>

            <div className="flex-1 max-w-xl mx-auto">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 group-focus-within:text-foreground/60 transition-colors" />
                <input
                  type="text"
                  placeholder="Search related channels..."
                  value={liveChannelSearch}
                  onChange={(e) => setLiveChannelSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-9 rounded-full bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-border focus:bg-muted/80 transition-all"
                />
                {liveChannelSearch && (
                  <button
                    onClick={() => setLiveChannelSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={copyUrl} title="Copy stream URL"
                className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-all">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
      )}
      /* ═══ Live TV / Fullscreen: Dark immersive overlay ═══ */
      <div
        ref={containerRef}
        className={`relative flex ${containerClass} transition-all duration-300 ease-out`}
        onMouseMove={showControlsTemporarily}
        onMouseLeave={() => { if (playing) { setShowControls(false); setSettingsPanel(null); } }}
      >
        {/* ═══════ MAIN PLAYER ═══════ */}
        <div className={`relative flex-1 min-w-0 flex flex-col bg-black ${
          fullscreen ? '' : sideVisible ? 'rounded-l-2xl' : 'rounded-2xl'
        } overflow-hidden`}>

          {/* ── Floating top bar (inside video, fades with controls) ── */}
          <div className={`absolute top-0 left-0 right-0 z-30 transition-all duration-500 ease-out ${
            showControls || !playing ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}>
            <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent pt-4 pb-12 px-5">
              <div className="flex items-center justify-between">
                {/* Channel info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] overflow-hidden backdrop-blur-sm border border-white/[0.06]">
                    {item.tvg_logo ? (
                      <img
                        src={item.tvg_logo}
                        alt=""
                        className="h-full w-full object-contain p-1.5"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const sib = e.currentTarget.nextElementSibling;
                          if (sib) (sib as HTMLElement).classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`flex items-center justify-center ${item.tvg_logo ? 'hidden' : ''}`}>
                      {isLive ? <Radio className="h-4 w-4 text-white/40" /> : <Play className="h-4 w-4 text-white/40" />}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-white text-[15px] leading-tight truncate max-w-md">
                      {displayName}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.group_title && (
                        <span className="text-[11px] text-white/40 truncate max-w-[200px]">{item.group_title}</span>
                      )}
                      {hasNavigation && (
                        <span className="text-[11px] text-white/25 tabular-nums shrink-0">
                          {currentIndex + 1} of {channelList!.length}
                        </span>
                      )}
                      {isLive && (
                        <span className="flex items-center gap-1 ml-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top-right actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {hasNavigation && (
                    <div className="flex items-center mr-1">
                      <button
                        onClick={() => prevChannel && navigateChannel(prevChannel)}
                        disabled={!prevChannel}
                        title={prevChannel ? `Previous: ${prevChannel.name}` : undefined}
                        className="rounded-lg p-2 text-white/50 transition-all disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/10 hover:text-white"
                      >
                        <SkipBack className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => nextChannel && navigateChannel(nextChannel)}
                        disabled={!nextChannel}
                        title={nextChannel ? `Next: ${nextChannel.name}` : undefined}
                        className="rounded-lg p-2 text-white/50 transition-all disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/10 hover:text-white"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <button onClick={copyUrl} title="Copy stream URL"
                    className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white transition-all">
                    <Copy className="h-3.5 w-3.5" />
                  </button>

                  {hasSideContent && (
                    <button
                      onClick={() => setShowSidePanel(!showSidePanel)}
                      title={showSidePanel ? 'Hide channels' : 'Show channels'}
                      className={`rounded-lg p-2 transition-all ${
                        showSidePanel ? 'text-white/70 bg-white/10' : 'text-white/40 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {showSidePanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    </button>
                  )}

                  <button onClick={onClose}
                    className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white transition-all ml-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Video area ── */}
          <div
            className={`relative flex-1 bg-black ${fullscreen ? 'w-full h-full' : viewMode === 'theater' ? 'flex-1' : 'aspect-video'}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('.player-controls, .player-overlay')) return;
              togglePlay();
              showControlsTemporarily();
            }}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('.player-controls, .player-overlay')) return;
              toggleFullscreen();
            }}
          >
          {/* Loading */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-white/80 animate-spin" />
            </div>
          )}

          {/* Error */}
          {error && !seriesLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-white/80 p-8 text-center z-20">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <div>
                <p className="text-base font-medium text-white/90 mb-1">Playback Error</p>
                <p className="text-sm text-white/50">{error}</p>
              </div>
              <button onClick={copyUrl}
                className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-5 py-2.5 text-sm text-white hover:bg-white/[0.12] transition-colors border border-white/[0.06]">
                <Copy className="h-4 w-4" /> Copy URL
              </button>
            </div>
          )}

          {/* Series loading */}
          {seriesLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
              <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/80 animate-spin mb-4" />
              <p className="text-sm text-white/50">Loading episodes...</p>
            </div>
          )}

          {/* Series episode selector */}
          {isSeries && seriesEpisodes && !seriesLoading && (
            <div className="player-overlay absolute top-0 right-0 bottom-0 w-72 z-30 bg-black/90 backdrop-blur-xl border-l border-white/[0.06] overflow-hidden flex flex-col">
              <div className="shrink-0 p-4 border-b border-white/[0.06]">
                <p className="text-white text-sm font-semibold truncate">{seriesEpisodes.seriesName || item.name}</p>
                {seriesEpisodes.seasons.length > 1 && (
                  <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-none">
                    {seriesEpisodes.seasons.map((s) => (
                      <button
                        key={s.season}
                        onClick={() => setSelectedSeason(s.season)}
                        className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all ${
                          selectedSeason === s.season
                            ? 'bg-white text-black font-semibold'
                            : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70'
                        }`}
                      >
                        Season {s.season}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-none p-2">
                {seriesEpisodes.seasons
                  .find(s => s.season === selectedSeason)
                  ?.episodes.map((ep) => (
                    <button
                      key={ep.id}
                      onClick={() => setActiveEpisode({ streamUrl: ep.streamUrl, title: ep.title })}
                      className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm transition-all ${
                        activeEpisode?.streamUrl === ep.streamUrl
                          ? 'bg-white/[0.1] text-white border border-white/[0.1]'
                          : 'text-white/60 hover:bg-white/[0.05] hover:text-white/80 border border-transparent'
                      }`}
                    >
                      <span className="text-white/30 text-xs mr-2 tabular-nums">E{ep.episode}</span>
                      <span className="truncate">{ep.title}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Big play button */}
          {!playing && !loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="w-20 h-20 rounded-full bg-white/[0.12] backdrop-blur-sm flex items-center justify-center">
                <Play className="h-9 w-9 text-white fill-white ml-1" />
              </div>
            </div>
          )}

          {/* Seek indicator */}
          {seekIndicator && (
            <div className={`absolute top-1/2 -translate-y-1/2 z-20 pointer-events-none ${
              seekIndicator.side === 'left' ? 'left-[15%]' : 'right-[15%]'
            }`}>
              <div className="flex flex-col items-center animate-pulse">
                <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  {seekIndicator.side === 'left' ? (
                    <SkipBack className="h-6 w-6 text-white" />
                  ) : (
                    <SkipForward className="h-6 w-6 text-white" />
                  )}
                </div>
                <span className="text-white text-xs mt-1.5 font-medium">{seekIndicator.seconds}s</span>
              </div>
            </div>
          )}

          {/* Quality badge */}
          {qualities.length > 0 && currentQuality !== -1 && showControls && (
            <div className="absolute top-4 right-4 z-20 pointer-events-none">
              <span className="bg-white/[0.1] backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/[0.06]">
                {qualities.find(q => q.index === currentQuality)?.label || ''}
              </span>
            </div>
          )}

          {/* Video element */}
          <video
            ref={videoRef}
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
            playsInline
            autoPlay
            preload="auto"
            onError={() => {
              if (hlsRef.current || initInProgressRef.current) return;
              setError('Video could not be played. Try opening in VLC.');
              setLoading(false);
            }}
          />

          {/* ── Bottom controls overlay ── */}
          <div
            className={`player-controls absolute bottom-0 left-0 right-0 z-20 transition-all duration-500 ease-out ${
              showControls || !playing ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

            <div className="relative px-4 pb-4 pt-16">
              {/* Progress bar */}
              {!isLive && duration > 0 && (
                <div
                  ref={progressRef}
                  className="group relative h-[3px] hover:h-[5px] bg-white/[0.15] rounded-full cursor-pointer mb-4 transition-all duration-200"
                  onClick={handleProgressClick}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={clearSeekPreview}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-white/[0.2] rounded-full transition-[width] duration-300"
                    style={{ width: `${bufferedPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-white rounded-full transition-[width] duration-100"
                    style={{ width: `${progress}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[13px] h-[13px] bg-white rounded-full scale-0 group-hover:scale-100 transition-transform duration-150 shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                    style={{ left: `${progress}%` }}
                  />
                </div>
              )}

              {/* Live indicator */}
              {isLive && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    Live
                  </span>
                </div>
              )}

              {/* Controls row */}
              <div className="flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  className="p-2 text-white hover:scale-110 transition-transform">
                  {playing
                    ? <Pause className="h-5 w-5 fill-white" />
                    : <Play className="h-5 w-5 fill-white" />
                  }
                </button>

                {hasNavigation && isLive && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); prevChannel && navigateChannel(prevChannel); }}
                      disabled={!prevChannel}
                      className="p-2 text-white/60 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); nextChannel && navigateChannel(nextChannel); }}
                      disabled={!nextChannel}
                      className="p-2 text-white/60 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </>
                )}

                {!isLive && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); seek(-10); }}
                      title="-10s (J)"
                      className="p-2 text-white/60 hover:text-white transition-colors">
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); seek(10); }}
                      title="+10s (L)"
                      className="p-2 text-white/60 hover:text-white transition-colors">
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </>
                )}

                {/* Volume group */}
                <div className="flex items-center group/vol">
                  <button onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    className="p-2 text-white/60 hover:text-white transition-colors">
                    {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300">
                    <input
                      type="range"
                      min={0} max={1} step={0.05}
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      onClick={(e) => e.stopPropagation()}
                      className="w-20 h-1 accent-white cursor-pointer"
                    />
                  </div>
                </div>

                {/* Time */}
                <div className="text-white/50 text-xs font-mono ml-1 select-none tabular-nums">
                  {!isLive && (
                    <>
                      <span className="text-white/80">{formatTime(currentTime)}</span>
                      {duration > 0 && <span className="text-white/30"> / {formatTime(duration)}</span>}
                    </>
                  )}
                </div>

                {/* Channel info in fullscreen */}
                {fullscreen && hasNavigation && (
                  <div className="flex items-center gap-2 ml-3">
                    {item.tvg_logo && (
                      <img src={item.tvg_logo} alt="" className="h-5 w-5 rounded object-contain shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <span className="text-white/60 text-xs truncate max-w-[200px]">{displayName}</span>
                    <span className="text-white/25 text-[10px] tabular-nums shrink-0">{currentIndex + 1}/{channelList!.length}</span>
                  </div>
                )}

                <div className="flex-1" />

                {/* Settings (VOD) */}
                {!isLive && (
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setSettingsPanel(settingsPanel ? null : 'main'); }}
                      className={`p-2 transition-all ${
                        settingsPanel ? 'text-white rotate-45' : speed !== 1 ? 'text-white' : 'text-white/50 hover:text-white'
                      }`}
                      title="Settings">
                      <Settings className="h-4 w-4" />
                    </button>

                    {settingsPanel && (
                      <div className="absolute bottom-full right-0 mb-3 w-52 bg-[#1a1a1e]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}>

                        {settingsPanel === 'main' && (
                          <div className="py-1">
                            <button onClick={() => setSettingsPanel('quality')}
                              className="flex items-center justify-between w-full px-4 py-3 text-[13px] text-white hover:bg-white/[0.06] transition-colors">
                              <span className="flex items-center gap-3">
                                <MonitorPlay className="h-4 w-4 text-white/40" />
                                Quality
                              </span>
                              <span className="text-[12px] text-white/40">
                                {currentQuality === -1 ? 'Auto' : qualities.find(q => q.index === currentQuality)?.label || 'Auto'}
                              </span>
                            </button>
                            <button onClick={() => setSettingsPanel('speed')}
                              className="flex items-center justify-between w-full px-4 py-3 text-[13px] text-white hover:bg-white/[0.06] transition-colors">
                              <span className="flex items-center gap-3">
                                <Settings className="h-4 w-4 text-white/40" />
                                Playback Speed
                              </span>
                              <span className="text-[12px] text-white/40">{speed === 1 ? 'Normal' : `${speed}x`}</span>
                            </button>
                          </div>
                        )}

                        {settingsPanel === 'quality' && (
                          <div>
                            <button onClick={() => setSettingsPanel('main')}
                              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-white/50 border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                              <ChevronLeft className="h-3 w-3" /> Quality
                            </button>
                            <div className="py-1">
                              <button onClick={() => changeQuality(-1)}
                                className={`flex items-center justify-between w-full px-4 py-2.5 text-[13px] hover:bg-white/[0.06] transition-colors ${
                                  currentQuality === -1 ? 'text-white font-medium' : 'text-white/70'
                                }`}>
                                Auto
                                {currentQuality === -1 && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </button>
                              {qualities.map((q) => (
                                <button key={q.index} onClick={() => changeQuality(q.index)}
                                  className={`flex items-center justify-between w-full px-4 py-2.5 text-[13px] hover:bg-white/[0.06] transition-colors ${
                                    currentQuality === q.index ? 'text-white font-medium' : 'text-white/70'
                                  }`}>
                                  <span className="flex items-center gap-2">
                                    {q.label}
                                    {q.height >= 1080 && <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded font-bold">HD</span>}
                                  </span>
                                  {currentQuality === q.index && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </button>
                              ))}
                              {qualities.length === 0 && (
                                <div className="px-4 py-3 text-xs text-white/30">Single quality stream</div>
                              )}
                            </div>
                          </div>
                        )}

                        {settingsPanel === 'speed' && (
                          <div>
                            <button onClick={() => setSettingsPanel('main')}
                              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-white/50 border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                              <ChevronLeft className="h-3 w-3" /> Speed
                            </button>
                            <div className="py-1">
                              {SPEEDS.map((s) => (
                                <button key={s} onClick={() => changeSpeed(s)}
                                  className={`flex items-center justify-between w-full px-4 py-2.5 text-[13px] hover:bg-white/[0.06] transition-colors ${
                                    speed === s ? 'text-white font-medium' : 'text-white/70'
                                  }`}>
                                  {s === 1 ? 'Normal' : `${s}x`}
                                  {speed === s && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* View mode */}
                {!fullscreen && (
                  <button onClick={(e) => { e.stopPropagation(); cycleViewMode(); }}
                    className="p-2 text-white/50 hover:text-white transition-colors"
                    title={`View: ${viewMode}`}>
                    {viewMode === 'normal' ? <Square className="h-4 w-4" /> :
                     viewMode === 'large' ? <RectangleHorizontal className="h-4 w-4" /> :
                     <Expand className="h-4 w-4" />}
                  </button>
                )}

                {/* Side panel */}
                {!fullscreen && hasSideContent && (
                  <button onClick={(e) => { e.stopPropagation(); setShowSidePanel(!showSidePanel); }}
                    className={`p-2 transition-all ${showSidePanel ? 'text-white' : 'text-white/50 hover:text-white'}`}
                    title={showSidePanel ? 'Hide channels' : 'Show channels'}>
                    {showSidePanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </button>
                )}

                {/* PiP */}
                {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                  <button onClick={(e) => { e.stopPropagation(); togglePip(); }}
                    className={`p-2 transition-all ${pip ? 'text-white' : 'text-white/50 hover:text-white'}`}
                    title="Picture-in-Picture (P)">
                    <PictureInPicture2 className="h-4 w-4" />
                  </button>
                )}

                {/* Fullscreen */}
                <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                  className="p-2 text-white/50 hover:text-white transition-colors"
                  title="Fullscreen (F)">
                  {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </button>

                {fullscreen && (
                  <button onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="p-2 text-white/50 hover:text-white transition-colors"
                    title="Close (Esc)">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* ═══════ SIDE PANEL — Live channels (desktop only, hidden on mobile) ═══════ */}
        {sideVisible && !isVod && (
          <div className={`hidden md:flex flex-col bg-card/70 border border-border/60 ${
            viewMode === 'theater' ? 'w-[360px]' : 'w-[330px]'
          } rounded-2xl overflow-hidden backdrop-blur-sm`}>
            <div className="shrink-0 px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Tv className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[13px] font-semibold text-foreground">
                    {item.group_title || 'Related'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {liveSupportReady ? filteredLiveChannels.length : '...'}
                  </span>
                  <button
                    onClick={() => setShowSidePanel(false)}
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                    title="Close panel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="h-px bg-border/60 mt-2" />
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-none px-2 pb-3">
              {!liveSupportReady ? (
                <div className="space-y-2 p-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
              <div className="space-y-0.5">
                {filteredLiveChannels.map((ch) => {
                  const isActive = ch.id === item.id;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => navigateChannel(ch)}
                      className={`flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all ${
                        isActive
                          ? 'bg-primary/15 text-foreground border border-primary/30'
                          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground border border-transparent'
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden ${
                        isActive ? 'bg-primary/20' : 'bg-muted/70'
                      }`}>
                        {ch.tvg_logo ? (
                          <img src={ch.tvg_logo} alt="" className="h-full w-full object-contain p-1"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <Radio className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] truncate leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
                          {ch.name}
                        </p>
                        {ch.group_title && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{ch.group_title}</p>
                        )}
                      </div>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              )}

              {liveSupportReady && filteredLiveChannels.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Search className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground/70">No channels match your search</p>
                  {liveChannelSearch && (
                    <button onClick={() => setLiveChannelSearch('')} className="text-xs text-primary hover:underline mt-2">
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════ MOBILE CHANNEL STRIP — horizontal scroll chips (md:hidden) ═══════ */}
      {hasNavigation && !isVod && !fullscreen && liveSupportReady && (
        <div className="md:hidden mt-2 px-4">
          <div className="flex items-center gap-2 mb-2">
            <Tv className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {item.group_title || 'Channels'}
            </span>
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {relatedChannels.length}
            </span>
          </div>
          <div className="overflow-x-auto scrollbar-none -mx-4 px-4 pb-3">
            <div className="flex gap-1.5 w-max">
              {/* Current channel pinned first */}
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold whitespace-nowrap shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {item.name}
              </button>
              {relatedChannels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => navigateChannel(ch)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-muted/80 hover:bg-muted text-[12px] font-medium text-foreground/80 whitespace-nowrap shrink-0 transition-colors"
                >
                  {ch.tvg_logo && (
                    <img src={ch.tvg_logo} alt="" className="h-4 w-4 rounded-sm object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  {ch.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* ── Fixed-position seek preview thumbnail (escapes overflow:hidden) ── */}
      {seekPreview !== null && seekPreviewPos && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: seekPreviewPos.x,
            top: seekPreviewPos.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="flex flex-col items-center mb-3">
            {seekPreviewThumb && (
              <div className="relative w-[192px] h-[108px] rounded-xl overflow-hidden bg-black border-2 border-white/[0.15] shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
                <img src={seekPreviewThumb} alt="" className="w-full h-full object-cover" draggable={false} />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.08] rounded-xl" />
              </div>
            )}
            <div className="mt-2 bg-white/95 backdrop-blur-sm text-black text-[11px] font-bold px-3 py-1 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.3)] tabular-nums tracking-tight">
              {formatTime(seekPreview)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
