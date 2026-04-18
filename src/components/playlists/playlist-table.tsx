'use client';

import { Playlist } from '@/types/database';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Eye, RefreshCw, MoreVertical, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    pending: 'secondary',
    scanning: 'secondary',
    error: 'destructive',
    inactive: 'outline',
  };

  return (
    <Badge variant={variants[status] || 'outline'} className="capitalize">
      {status === 'scanning' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {status}
    </Badge>
  );
}

function formatDate(dateString: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PlaylistTable({ playlists }: { playlists: Playlist[] }) {
  const router = useRouter();
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  async function handleScan(id: string, sourceUrl: string) {
    setScanningIds((prev) => new Set(prev).add(id));
    try {
      // Fetch M3U from browser to avoid server IP blocks
      let content: string | null = null;
      try {
        const m3uRes = await fetch(sourceUrl);
        if (m3uRes.ok) content = await m3uRes.text();
      } catch {
        // Browser fetch failed, server will try
      }

      const res = await fetch(`/api/playlists/${id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content ? { content } : {}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Scan failed');
      }
      toast.success('Scan completed successfully');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleDelete(id: string) {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      toast.success('Playlist deleted');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <p className="text-lg font-medium text-muted-foreground">No playlists yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your first playlist to get started
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Channels</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Movies</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Series</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Total</TableHead>
            <TableHead className="hidden lg:table-cell">Last Scan</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {playlists.map((playlist) => (
            <TableRow key={playlist.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{playlist.name}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px] lg:max-w-[300px]">
                    {playlist.source_url}
                  </p>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">{playlist.type}</Badge>
              </TableCell>
              <TableCell>
                <StatusBadge status={playlist.status} />
              </TableCell>
              <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                {playlist.channels_count.toLocaleString()}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                {playlist.movies_count.toLocaleString()}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                {playlist.series_count.toLocaleString()}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-right font-mono text-sm">
                {playlist.total_items.toLocaleString()}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                {formatDate(playlist.last_scan_at)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => router.push(`/playlists/${playlist.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleScan(playlist.id, playlist.source_url)}
                    disabled={scanningIds.has(playlist.id)}
                  >
                    {scanningIds.has(playlist.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => router.push(`/playlists/${playlist.id}`)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleScan(playlist.id, playlist.source_url)}
                        disabled={scanningIds.has(playlist.id)}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Rescan
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(playlist.id)}
                        disabled={deletingIds.has(playlist.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
