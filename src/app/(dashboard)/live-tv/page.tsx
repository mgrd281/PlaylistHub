import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LiveTVBrowser } from '@/components/browse/live-tv-browser';

export default async function LiveTVPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <LiveTVBrowser />;
}
