import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { PlaylistDetail } from '@/components/playlists/playlist-detail';
import { Playlist } from '@/types/database';

export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: playlist, error } = await supabase
    .from('playlists')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !playlist) notFound();

  return <PlaylistDetail playlist={playlist as Playlist} />;
}
