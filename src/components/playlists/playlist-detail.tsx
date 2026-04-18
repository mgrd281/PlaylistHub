'use client';

import { Playlist, PlaylistItem } from '@/types/database';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoPlayerDialog } from '@/components/playlists/video-player-dialog';
import { ChannelBrowser } from '@/components/playlists/channel-browser';
import { MovieBrowser } from '@/components/playlists/movie-browser';
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Tv,
  Film,
  Clapperboard,
  Search,
  Layers,
  Hash,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

const TYPE_ICONS: Record<string, React.ElementType> = {
  channel: Tv,
  movie: Film,
  series: Clapperboard,
  uncategorized: Layers,
};

function ContentTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    channel: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    movie: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
    series: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    uncategorized: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700',
  };

  const Icon = TYPE_ICONS[type] || Layers;

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${colors[type] || colors.uncategorized}`}>
      <Icon className="h-3 w-3" />
      {type}
    </span>
  );
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/***`;
  } catch {
    return '***';
  }
}

interface ItemsResponse {
  items: PlaylistItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function formatScanError(error: string): string {
  if (error.includes('FETCH_BLOCKED') || error.includes('SERVER_FETCH_FAILED')) {
    return 'This provider blocks URL-based fetching. Please verify the URL, credentials, and provider access rules.';
  }

  if (error.includes('SCANNER_REQUIRED_FOR_URL_ONLY')) {
    return 'Scanner service is required for URL-only mode.';
  }

  if (error.includes('Invalid M3U format')) {
    return 'The server returned a web page instead of an M3U response for this URL.';
  }

  return error;
}

export function PlaylistDetail({ playlist }: { playlist: Playlist }) {
  const router = useRouter();
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [manualContent, setManualContent] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlaylistItem | null>(null);
  const [channelContext, setChannelContext] = useState<PlaylistItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });
      if (activeTab !== 'all') params.set('type', activeTab);
      if (search) params.set('search', search);

      const res = await fetch(`/api/playlists/${playlist.id}/items?${params}`);
      if (!res.ok) throw new Error('Failed to fetch items');

      const data: ItemsResponse = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [playlist.id, activeTab, search, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search]);

  async function handleFileUpload(file: File) {
    setIsProcessingFile(true);
    try {
      const text = await file.text();
      if (!text.trim()) {
        toast.error('Selected file is empty');
        return;
      }
      setManualContent(text);
      toast.success('M3U file loaded. Click Scan Now to parse it.');
    } catch {
      toast.error('Failed to read file');
    } finally {
      setIsProcessingFile(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    try {
      // Preferred free path: local file/paste content (avoids provider URL/IP blocks)
      let content: string | null = manualContent.trim() ? manualContent : null;

      // Fallback: fetch in browser (can still fail by CORS/provider rules)
      if (!content) {
        try {
          const m3uRes = await fetch(playlist.source_url);
          if (m3uRes.ok) {
            content = await m3uRes.text();
          }
        } catch {
          // Browser fetch failed, server strategies will run next
        }
      }

      const res = await fetch(`/api/playlists/${playlist.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content ? { content } : {}),
      });
      if (!res.ok) {
        const data = await res.json();
        const error = data.error || 'Scan failed';
        throw new Error(error);
      }
      toast.success('Scan completed');
      router.refresh();
      fetchItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      toast.error(formatScanError(message));
    } finally {
      setScanning(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Playlist deleted');
      router.push('/playlists');
      router.refresh();
    } catch {
      toast.error('Failed to delete playlist');
    }
  }

  const stats = [
    { label: 'Total Items', value: playlist.total_items, icon: Hash, color: 'text-foreground' },
    { label: 'Channels', value: playlist.channels_count, icon: Tv, color: 'text-blue-600' },
    { label: 'Movies', value: playlist.movies_count, icon: Film, color: 'text-purple-600' },
    { label: 'Series', value: playlist.series_count, icon: Clapperboard, color: 'text-amber-600' },
    { label: 'Categories', value: playlist.categories_count, icon: Layers, color: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <VideoPlayerDialog
        item={selectedItem}
        channelList={selectedItem?.content_type === 'channel' ? channelContext : undefined}
        onClose={() => setSelectedItem(null)}
        onNavigate={(ch) => setSelectedItem(ch)}
      />
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-0.5" onClick={() => router.push('/playlists')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{playlist.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{maskUrl(playlist.source_url)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {playlist.status === 'pending' || playlist.status === 'error' ? 'Scan Now' : 'Rescan'}
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {(playlist.status === 'error' || playlist.status === 'pending' || playlist.status === 'scanning') && (
        <div className={`rounded-lg border p-4 text-sm ${
          playlist.status === 'error'
            ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
            : playlist.status === 'scanning'
            ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
            : 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
        }`}>
          {playlist.status === 'error' && playlist.error_message?.includes('SCANNER_REQUIRED_FOR_URL_ONLY') && (
            <div className="space-y-2">
              <p><strong>URL-only mode requires an external scanner.</strong></p>
              <p className="text-xs">Set SCANNER_API_URL (and optionally SCANNER_API_TOKEN) in Vercel environment variables, then redeploy.</p>
            </div>
          )}
          {playlist.status === 'error' && (playlist.error_message?.includes('SERVER_FETCH_FAILED') || playlist.error_message?.includes('FETCH_BLOCKED')) && (
            <div className="space-y-2">
              <p><strong>This provider blocks URL-based automatic fetching.</strong></p>
              <p className="text-xs">Use local M3U upload/paste below, or request provider IP whitelist access.</p>
            </div>
          )}
          {playlist.status === 'error' && !playlist.error_message?.includes('SERVER_FETCH_FAILED') && !playlist.error_message?.includes('FETCH_BLOCKED') && !playlist.error_message?.includes('SCANNER_REQUIRED_FOR_URL_ONLY') && (
            <p><strong>Scan failed:</strong> {playlist.error_message || 'Unknown error'}</p>
          )}
          {playlist.status === 'pending' && (
            <p>This playlist has not been scanned yet. Click <strong>&quot;Scan Now&quot;</strong> to parse the URL.</p>
          )}
          {playlist.status === 'scanning' && (
            <p>Scan in progress... This may take a moment for large playlists.</p>
          )}
        </div>
      )}

      {/* Free Fallback Input */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".m3u,.m3u8,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleFileUpload(file);
                }
                e.currentTarget.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile || scanning}
            >
              {isProcessingFile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Load M3U File
            </Button>
            {manualContent.trim() && (
              <Badge variant="outline" className="w-fit">Local M3U loaded</Badge>
            )}
          </div>
          <textarea
            value={manualContent}
            onChange={(e) => setManualContent(e.target.value)}
            placeholder="Paste full M3U content here (#EXTM3U...) for a fully free scan flow"
            className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            If your provider blocks URL fetching, paste M3U content or load a local .m3u file, then click Scan Now.
          </p>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="channel">Channels</TabsTrigger>
            <TabsTrigger value="movie">Movies</TabsTrigger>
            <TabsTrigger value="series">Series</TabsTrigger>
            <TabsTrigger value="uncategorized">Other</TabsTrigger>
          </TabsList>
        </Tabs>
        {activeTab !== 'channel' && activeTab !== 'movie' && (
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {/* Items Display */}
      {activeTab === 'channel' ? (
        <ChannelBrowser
          playlistId={playlist.id}
          totalChannels={playlist.channels_count}
          onSelectItem={(item, context) => { setSelectedItem(item); setChannelContext(context); }}
        />
      ) : activeTab === 'movie' ? (
        <MovieBrowser
          playlistId={playlist.id}
          totalMovies={playlist.movies_count}
          onSelectItem={(item) => setSelectedItem(item)}
        />
      ) : loading ? (
        <div className="rounded-lg border bg-card p-6 space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20">
          <div className="rounded-full bg-muted p-3 mb-3">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">No items found</p>
          {search && (
            <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Group</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden lg:table-cell">Stream</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-muted/60"
                  onClick={() => setSelectedItem(item)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {item.tvg_logo ? (
                        <img
                          src={item.tvg_logo}
                          alt=""
                          loading="lazy"
                          className="h-8 w-8 rounded object-contain bg-muted"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                          {item.content_type === 'movie' ? (
                            <Film className="h-4 w-4 text-muted-foreground/50" />
                          ) : item.content_type === 'series' ? (
                            <Clapperboard className="h-4 w-4 text-muted-foreground/50" />
                          ) : (
                            <Layers className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </div>
                      )}
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {item.group_title ? (
                      <Badge variant="outline" className="font-normal">
                        {item.group_title}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ContentTypeBadge type={item.content_type} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <code className="text-xs text-muted-foreground">
                      {maskUrl(item.stream_url)}
                    </code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {activeTab !== 'channel' && activeTab !== 'movie' && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
