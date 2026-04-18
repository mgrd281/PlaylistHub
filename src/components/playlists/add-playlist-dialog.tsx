'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

export function AddPlaylistDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (!name.trim()) {
        setName(selected.name.replace(/\.(m3u8?|txt)$/i, ''));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!url.trim() && !file) return;

    setLoading(true);
    try {
      // Read file content if provided
      let fileContent: string | null = null;
      if (file) {
        fileContent = await file.text();
      }

      const sourceUrl = url.trim() || `file://${file?.name || 'uploaded.m3u'}`;

      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), source_url: sourceUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add playlist');
      }

      const playlist = await res.json();
      toast.success('Playlist added — scanning...');

      // Start scan with content
      (async () => {
        try {
          let content = fileContent;

          // If no file, try browser fetch
          if (!content && url.trim()) {
            try {
              const m3uRes = await fetch(url.trim());
              if (m3uRes.ok) content = await m3uRes.text();
            } catch {
              // Browser fetch failed (CORS), server will try
            }
          }

          const scanRes = await fetch(`/api/playlists/${playlist.id}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(content ? { content } : {}),
          });

          if (scanRes.ok) {
            toast.success('Scan completed!');
          } else {
            const data = await scanRes.json();
            toast.error(data.error || 'Scan failed');
          }
          router.refresh();
        } catch {
          router.refresh();
        }
      })();

      setName('');
      setUrl('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add playlist');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Playlist
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Playlist</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Playlist Name</Label>
            <Input
              id="name"
              placeholder="My Playlist"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">Playlist URL</Label>
            <Input
              id="url"
              placeholder="https://example.com/playlist.m3u"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!!file}
            />
          </div>
          <div className="relative flex items-center gap-2">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground">or upload file</span>
            <div className="flex-1 border-t" />
          </div>
          <div className="space-y-2">
            <div
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {file ? file.name : 'Click to upload M3U / M3U8 file'}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".m3u,.m3u8,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">
              Upload if the URL is blocked. Download the file in your browser first, then upload here.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || (!url.trim() && !file)}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add & Scan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
