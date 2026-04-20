import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DeviceList } from '@/components/devices/device-list';
import type { Device } from '@/types/database';

export default async function DevicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: devices } = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your linked devices and activation codes
        </p>
      </div>

      <DeviceList devices={(devices || []) as Device[]} />
    </div>
  );
}
