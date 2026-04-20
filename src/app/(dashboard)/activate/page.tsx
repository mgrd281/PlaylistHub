import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ActivateForm } from '@/components/devices/activate-form';

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/admin-portal?next=/activate');

  const { code } = await searchParams;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activate Device</h1>
        <p className="mt-1 text-muted-foreground">
          Enter the activation code shown on your device
        </p>
      </div>

      <ActivateForm initialCode={code || ''} />
    </div>
  );
}
