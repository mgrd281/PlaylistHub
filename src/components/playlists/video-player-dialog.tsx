'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, AlertCircle, Loader2, Copy, ExternalLink,
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Settings, RotateCcw,
  PictureInPicture2, MonitorPlay, ChevronLeft,
} from 'lucide-react';
import { PlaylistItem } from '@/types/database';
import { toast } from 'sonner';

interface VideoPlayerDialogProps {
  item: PlaylistItem | null;
  onClose: () => void;
}

/* ── Resume position storage ── */
const RESUME_KEY = 'playlisthub_resume';

function getSavedPosition(streamUrl: string): number {
  try {
    const data = JSON.parse(localStorage.getItem(RESUME_KEY) || '{}');
    return data[streamUrl] ?? 0;
  } catch { return 0; }
}

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

export function VideoPlayerDialog({ item, onClose }: VideoPlayerDialogProps) {
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
  const [resumeOffer, setResumeOffer] = useState<number | null>(null);
  const [qualities, setQualities] = useState<{ height: number; label: string; index: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto
  const [pip, setPip] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<'main' | 'speed' | 'quality' | null>(null);
  const [seekIndicator, setSeekIndicator] = useState<{ side: 'left' | 'right'; seconds: number } | null>(null);
  const seekIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Series episode state
  const [seriesEpisodes, setSeriesEpisodes] = useState<{
    seasons: { season: number; episodes: { id: string; title: string; season: number; episode: number; streamUrl: string }[] }[];
    seriesName: string;
  } | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [activeEpisode, setActiveEpisode] = useState<{ streamUrl: string; title: string } | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);

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
    setResumeOffer(null);
    setSpeed(1);

    const video = videoRef.current;
    if (!video) return;

    const url = resolveStreamUrl(item, activeEpisode?.streamUrl);
    const proxied = proxyUrl(url);

    const isHls =
      url.includes('.m3u8') ||
      url.includes('/live/') ||
      url.includes('/hls/') ||
      item.content_type === 'channel';

    const saved = isLive ? 0 : getSavedPosition(url);

    async function initPlayer() {
      if (!video) return;
      video.playbackRate = 1;

      // All traffic goes through /api/stream → Scanner Service (non-blocked IP + VLC UA)
      const proxied = proxyUrl(url);
      const proxiedHls = proxyUrl(url.replace(/\.\w+$/, '.m3u8'));

      if (isHls) {
        // Safari native HLS
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = proxied;
          video.load();
          if (saved > 10) setResumeOffer(saved);
          try { await video.play(); } catch { /* user presses play */ }
          setLoading(false);
          return;
        }

        // Chrome/Firefox — use hls.js
        const Hls = (await import('hls.js')).default;
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: isLive,
            maxBufferLength: isLive ? 8 : 30,
            maxMaxBufferLength: isLive ? 20 : 120,
            backBufferLength: isLive ? 0 : 30,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,
            fragLoadingTimeOut: 25000,
            fragLoadingMaxRetry: 6,
            fragLoadingRetryDelay: 1000,
            levelLoadingTimeOut: 15000,
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 4,
            manifestLoadingRetryDelay: 1000,
            startFragPrefetch: true,
            testBandwidth: !isLive,
          });
          hlsRef.current = hls;
          hls.loadSource(proxied);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, async (_: unknown, data: { levels: { height: number; width: number; bitrate: number }[] }) => {
            setLoading(false);
            if (saved > 10) setResumeOffer(saved);
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
              hls.currentLevel = q[0].index;
              setCurrentQuality(q[0].index);
            }
            try { await video.play(); } catch { /* user presses play */ }
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
                setTimeout(() => {
                  hls.startLoad();
                }, 1000 * networkErrorRecoveries);
              } else {
                setError('تعذّر تشغيل البث.');
                setLoading(false);
              }
            }
            // Non-fatal buffer stall — try to nudge playback
            if (!data.fatal && data.details === 'bufferStalledError' && video) {
              const ct = video.currentTime;
              if (ct > 0) video.currentTime = ct + 0.1;
            }
          });
          return;
        }
      }

      // ── VOD/MP4 (movies, series episodes) — proxy through scanner ──
      if (await tryVideoUrl(video, proxied, 20000)) {
        if (saved > 10) setResumeOffer(saved);
        try { await video.play(); } catch { /* user presses play */ }
        setLoading(false);
        return;
      }

      // Try HLS conversion via proxy
      if (/\/(movie|series)\/[^/]+\/[^/]+\/\d+\.\w+$/.test(url) && !url.endsWith('.m3u8')) {
        if (await tryVideoUrl(video, proxiedHls, 15000)) {
          if (saved > 10) setResumeOffer(saved);
          try { await video.play(); } catch { /* user presses play */ }
          setLoading(false);
          return;
        }
      }

      setError('تعذّر تشغيل الفيديو. جرّب فتحه في VLC.');
      setLoading(false);
    }

    void initPlayer();

    return () => {
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
    const onCanPlay = () => setLoading(false);

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
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
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
  }, [onClose, duration, showControlsTemporarily, toggleFullscreen, togglePip]);

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
    setSeekPreview(pct * duration);
  }, [duration]);

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

  const resumeFromSaved = () => {
    const video = videoRef.current;
    if (!video || resumeOffer === null) return;
    video.currentTime = resumeOffer;
    setResumeOffer(null);
  };

  const dismissResume = () => setResumeOffer(null);

  if (!item) return null;

  const streamUrl = resolveStreamUrl(item, activeEpisode?.streamUrl);
  const vlcUrl = `vlc://${streamUrl}`;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const displayName = activeEpisode?.title || item.name;

  function copyUrl() {
    void navigator.clipboard.writeText(streamUrl);
    toast.success('Stream URL copied');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={containerRef}
        className={`relative ${fullscreen ? 'w-screen h-screen' : 'w-full max-w-5xl mx-4'}`}
        onMouseMove={showControlsTemporarily}
        onMouseLeave={() => { if (playing) setShowControls(false); }}
      >
        {/* Header — only when not fullscreen */}
        {!fullscreen && (
          <div className="flex items-center justify-between bg-zinc-900/95 px-4 py-2.5 rounded-t-xl border-b border-zinc-800">
            <div className="flex items-center gap-3 min-w-0">
              {item.tvg_logo && (
                <img
                  src={item.tvg_logo}
                  alt=""
                  className="h-8 w-8 rounded object-contain bg-zinc-800 shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-white truncate text-sm">{displayName}</p>
                {item.group_title && (
                  <p className="text-xs text-zinc-500 truncate">{item.group_title}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 ml-4 shrink-0">
              <button onClick={copyUrl} title="Copy stream URL"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-700/50 hover:text-white transition-colors">
                <Copy className="h-4 w-4" />
              </button>
              <a href={vlcUrl} title="Open in VLC"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-700/50 hover:text-white transition-colors">
                <ExternalLink className="h-4 w-4" />
              </a>
              <button onClick={onClose}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-700/50 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Video area */}
        <div
          className={`relative bg-black overflow-hidden ${fullscreen ? 'w-full h-full' : 'rounded-b-xl aspect-video'}`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('.player-controls')) return;
            togglePlay();
            showControlsTemporarily();
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('.player-controls')) return;
            toggleFullscreen();
          }}
        >
          {/* Loading spinner */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="bg-black/50 rounded-full p-4">
                <Loader2 className="h-10 w-10 animate-spin text-white/80" />
              </div>
            </div>
          )}

          {/* Resume offer */}
          {resumeOffer !== null && (
            <div className="absolute top-4 left-4 z-30 bg-zinc-900/95 rounded-lg px-4 py-3 flex items-center gap-3 shadow-xl border border-zinc-700">
              <RotateCcw className="h-5 w-5 text-blue-400 shrink-0" />
              <div className="text-sm">
                <p className="text-white">Continue from {formatTime(resumeOffer)}?</p>
              </div>
              <button onClick={resumeFromSaved}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md transition-colors">
                Resume
              </button>
              <button onClick={dismissResume}
                className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded-md transition-colors">
                Start Over
              </button>
            </div>
          )}

          {/* Error overlay */}
          {error && !seriesLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/80 p-6 text-center z-20">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-sm">{error}</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={copyUrl}
                  className="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700 transition-colors">
                  <Copy className="h-4 w-4" /> Copy URL
                </button>
                <a href={vlcUrl}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 transition-colors">
                  <ExternalLink className="h-4 w-4" /> Open in VLC
                </a>
              </div>
            </div>
          )}

          {/* Series loading */}
          {seriesLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
              <Loader2 className="h-10 w-10 animate-spin text-white/80 mb-3" />
              <p className="text-sm text-white/60">جاري تحميل الحلقات...</p>
            </div>
          )}

          {/* Series episode selector */}
          {isSeries && seriesEpisodes && !seriesLoading && (
            <div className="absolute top-0 right-0 bottom-0 w-72 z-30 bg-zinc-900/95 border-l border-zinc-700/50 backdrop-blur-xl overflow-y-auto">
              <div className="sticky top-0 bg-zinc-900/98 border-b border-zinc-700/50 p-3">
                <p className="text-white text-sm font-semibold truncate">{seriesEpisodes.seriesName || item.name}</p>
                {seriesEpisodes.seasons.length > 1 && (
                  <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
                    {seriesEpisodes.seasons.map((s) => (
                      <button
                        key={s.season}
                        onClick={() => setSelectedSeason(s.season)}
                        className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${
                          selectedSeason === s.season
                            ? 'bg-red-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        S{s.season}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-2">
                {seriesEpisodes.seasons
                  .find(s => s.season === selectedSeason)
                  ?.episodes.map((ep) => (
                    <button
                      key={ep.id}
                      onClick={() => setActiveEpisode({ streamUrl: ep.streamUrl, title: ep.title })}
                      className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors ${
                        activeEpisode?.streamUrl === ep.streamUrl
                          ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                          : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <span className="text-zinc-500 text-xs mr-2">E{ep.episode}</span>
                      <span className="truncate">{ep.title}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Big play button when paused */}
          {!playing && !loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-black/40 rounded-full p-5">
                <Play className="h-12 w-12 text-white fill-white" />
              </div>
            </div>
          )}

          {/* Seek indicator (Netflix-style) */}
          {seekIndicator && (
            <div className={`absolute top-1/2 -translate-y-1/2 z-20 pointer-events-none animate-pulse ${
              seekIndicator.side === 'left' ? 'left-[15%]' : 'right-[15%]'
            }`}>
              <div className="bg-black/50 rounded-full p-4 flex flex-col items-center">
                {seekIndicator.side === 'left' ? (
                  <SkipBack className="h-6 w-6 text-white" />
                ) : (
                  <SkipForward className="h-6 w-6 text-white" />
                )}
                <span className="text-white text-xs mt-1 font-medium">{seekIndicator.seconds}s</span>
              </div>
            </div>
          )}

          {/* Quality badge */}
          {qualities.length > 0 && currentQuality !== -1 && showControls && (
            <div className="absolute top-3 right-3 z-20 pointer-events-none">
              <span className="bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                {qualities.find(q => q.index === currentQuality)?.label || ''}
              </span>
            </div>
          )}

          {/* Video element — no native controls */}
          <video
            ref={videoRef}
            className="w-full h-full"
            playsInline
            onError={() => {
              if (hlsRef.current) return;
              // initPlayer already tried all fallbacks; this fires if the final src fails
              setError('تعذّر تشغيل الفيديو. جرّب فتحه في VLC.');
              setLoading(false);
            }}
          />

          {/* Custom controls overlay */}
          <div
            className={`player-controls absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${
              showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

            <div className="relative px-3 pb-3 pt-10">
              {/* Progress bar */}
              {!isLive && duration > 0 && (
                <div
                  ref={progressRef}
                  className="group relative h-1 hover:h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 transition-all"
                  onClick={handleProgressClick}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={() => setSeekPreview(null)}
                >
                  {/* Buffered */}
                  <div
                    className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
                    style={{ width: `${bufferedPct}%` }}
                  />
                  {/* Progress */}
                  <div
                    className="absolute inset-y-0 left-0 bg-red-500 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                  {/* Scrub handle */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    style={{ left: `${progress}%` }}
                  />
                  {/* Seek preview tooltip */}
                  {seekPreview !== null && (
                    <div
                      className="absolute -top-8 -translate-x-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded pointer-events-none"
                      style={{ left: `${(seekPreview / duration) * 100}%` }}
                    >
                      {formatTime(seekPreview)}
                    </div>
                  )}
                </div>
              )}

              {/* Live indicator */}
              {isLive && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    LIVE
                  </span>
                </div>
              )}

              {/* Controls row */}
              <div className="flex items-center gap-2">
                {/* Play/Pause */}
                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  className="p-1.5 text-white hover:text-white/80 transition-colors">
                  {playing ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
                </button>

                {/* Skip back/forward (VOD only) */}
                {!isLive && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); seek(-10); }}
                      title="-10s (J)"
                      className="p-1.5 text-white/70 hover:text-white transition-colors">
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); seek(10); }}
                      title="+10s (L)"
                      className="p-1.5 text-white/70 hover:text-white transition-colors">
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </>
                )}

                {/* Volume */}
                <button onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  className="p-1.5 text-white/70 hover:text-white transition-colors">
                  {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0} max={1} step={0.05}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 h-1 accent-white cursor-pointer"
                />

                {/* Time */}
                <div className="text-white/80 text-xs font-mono ml-1 select-none">
                  {!isLive && (
                    <>
                      {formatTime(currentTime)}
                      {duration > 0 && <span className="text-white/40"> / {formatTime(duration)}</span>}
                    </>
                  )}
                </div>

                <div className="flex-1" />

                {/* Speed (VOD only) */}
                {!isLive && (
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setSettingsPanel(settingsPanel ? null : 'main'); }}
                      className={`p-1.5 transition-colors ${speed !== 1 ? 'text-red-400' : 'text-white/70 hover:text-white'}`}
                      title="Settings">
                      <Settings className="h-4 w-4" />
                    </button>

                    {/* Settings panel */}
                    {settingsPanel && (
                      <div className="absolute bottom-full right-0 mb-2 w-56 bg-zinc-900/98 border border-zinc-700/50 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl"
                        onClick={(e) => e.stopPropagation()}>

                        {/* Main menu */}
                        {settingsPanel === 'main' && (
                          <>
                            <button onClick={() => setSettingsPanel('quality')}
                              className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors">
                              <span className="flex items-center gap-2.5">
                                <MonitorPlay className="h-4 w-4 text-zinc-400" />
                                Quality
                              </span>
                              <span className="text-xs text-zinc-400">
                                {currentQuality === -1 ? 'Auto' : qualities.find(q => q.index === currentQuality)?.label || 'Auto'}
                              </span>
                            </button>
                            <button onClick={() => setSettingsPanel('speed')}
                              className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors">
                              <span className="flex items-center gap-2.5">
                                <Settings className="h-4 w-4 text-zinc-400" />
                                Speed
                              </span>
                              <span className="text-xs text-zinc-400">{speed === 1 ? 'Normal' : `${speed}x`}</span>
                            </button>
                          </>
                        )}

                        {/* Quality submenu */}
                        {settingsPanel === 'quality' && (
                          <>
                            <button onClick={() => setSettingsPanel('main')}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-400 border-b border-zinc-700/50 hover:bg-white/5">
                              <ChevronLeft className="h-3 w-3" /> Quality
                            </button>
                            <button onClick={() => changeQuality(-1)}
                              className={`flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                                currentQuality === -1 ? 'text-red-400 font-medium' : 'text-white'
                              }`}>
                              Auto
                              {currentQuality === -1 && <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />}
                            </button>
                            {qualities.map((q) => (
                              <button key={q.index} onClick={() => changeQuality(q.index)}
                                className={`flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                                  currentQuality === q.index ? 'text-red-400 font-medium' : 'text-white'
                                }`}>
                                {q.label}
                                {q.height >= 1080 && <span className="text-[10px] bg-blue-600 text-white px-1 rounded">HD</span>}
                                {currentQuality === q.index && <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />}
                              </button>
                            ))}
                            {qualities.length === 0 && (
                              <div className="px-4 py-3 text-xs text-zinc-500">Single quality stream</div>
                            )}
                          </>
                        )}

                        {/* Speed submenu */}
                        {settingsPanel === 'speed' && (
                          <>
                            <button onClick={() => setSettingsPanel('main')}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-400 border-b border-zinc-700/50 hover:bg-white/5">
                              <ChevronLeft className="h-3 w-3" /> Speed
                            </button>
                            {SPEEDS.map((s) => (
                              <button key={s} onClick={() => changeSpeed(s)}
                                className={`flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                                  speed === s ? 'text-red-400 font-medium' : 'text-white'
                                }`}>
                                {s === 1 ? 'Normal' : `${s}x`}
                                {speed === s && <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* PiP */}
                {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                  <button onClick={(e) => { e.stopPropagation(); togglePip(); }}
                    className={`p-1.5 transition-colors ${pip ? 'text-blue-400' : 'text-white/70 hover:text-white'}`}
                    title="Picture-in-Picture (P)">
                    <PictureInPicture2 className="h-4 w-4" />
                  </button>
                )}

                {/* Fullscreen */}
                <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                  className="p-1.5 text-white/70 hover:text-white transition-colors"
                  title="Fullscreen (F)">
                  {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </button>

                {/* Close in fullscreen */}
                {fullscreen && (
                  <button onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="p-1.5 text-white/70 hover:text-white transition-colors"
                    title="Close (Esc)">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Keyboard shortcuts hint — below player, not fullscreen */}
        {!fullscreen && (
          <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-zinc-600 select-none">
            <span>Space: Play/Pause</span>
            <span>←→: Seek 10s</span>
            <span>↑↓: Volume</span>
            <span>F: Fullscreen</span>
            <span>M: Mute</span>
            <span>P: PiP</span>
            <span>0-9: Jump</span>
          </div>
        )}
      </div>
    </div>
  );
}
