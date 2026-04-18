import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TVShell } from '@/components/tv/tv-shell';

export default async function TVPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <TVShell />;
}
