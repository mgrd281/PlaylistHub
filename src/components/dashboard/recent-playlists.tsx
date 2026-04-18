'use client';

import { Playlist } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

export function RecentPlaylists({ playlists }: { playlists: Playlist[] }) {
  const router = useRouter();
  const recent = playlists.slice(0, 5);

  if (recent.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Playlists</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No playlists added yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Recent Playlists</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => router.push('/playlists')}>
          View All
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recent.map((playlist) => (
            <div
              key={playlist.id}
              className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
              onClick={() => router.push(`/playlists/${playlist.id}`)}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{playlist.name}</p>
                <p className="text-xs text-muted-foreground">
                  {playlist.total_items.toLocaleString()} items
                </p>
              </div>
              <Badge
                variant={playlist.status === 'active' ? 'default' : playlist.status === 'error' ? 'destructive' : 'secondary'}
                className="capitalize shrink-0"
              >
                {playlist.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
