import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ContentBrowser } from '@/components/browse/content-browser';

export default async function MoviesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <ContentBrowser contentType="movie" />;
}
