import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MediaHome } from '@/components/dashboard/media-home';
import { Playlist } from '@/types/database';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/admin-portal');

  const { data: playlists } = await supabase
    .from('playlists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const playlistData = (playlists || []) as Playlist[];

  return <MediaHome playlists={playlistData} />;
}
