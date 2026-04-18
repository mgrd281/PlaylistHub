import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PlaylistTable } from '@/components/playlists/playlist-table';
import { AddPlaylistDialog } from '@/components/playlists/add-playlist-dialog';
import { Playlist } from '@/types/database';

export default async function PlaylistsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: playlists } = await supabase
    .from('playlists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const playlistData = (playlists || []) as Playlist[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manage Playlists</h1>
          <p className="mt-1 text-muted-foreground">
            {playlistData.length} {playlistData.length === 1 ? 'playlist' : 'playlists'}
          </p>
        </div>
        <AddPlaylistDialog />
      </div>

      <PlaylistTable playlists={playlistData} />
    </div>
  );
}
