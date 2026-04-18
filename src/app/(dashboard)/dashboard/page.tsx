import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardStats } from '@/components/dashboard/dashboard-stats';
import { RecentPlaylists } from '@/components/dashboard/recent-playlists';
import { AddPlaylistDialog } from '@/components/playlists/add-playlist-dialog';
import { Playlist } from '@/types/database';

export default async function DashboardPage() {
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Overview of your playlist library
          </p>
        </div>
        <AddPlaylistDialog />
      </div>

      <DashboardStats playlists={playlistData} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentPlaylists playlists={playlistData} />
      </div>
    </div>
  );
}
