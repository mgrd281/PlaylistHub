'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/types/database';
import {
  Monitor,
  Smartphone,
  Tv,
  Globe,
  MoreHorizontal,
  Copy,
  Check,
  Trash2,
  Shield,
  ShieldOff,
  Pencil,
  QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

function platformIcon(platform: string) {
  switch (platform) {
    case 'ios':
      return <Smartphone className="h-5 w-5" />;
    case 'tvos':
      return <Tv className="h-5 w-5" />;
    case 'android':
      return <Smartphone className="h-5 w-5" />;
    case 'web':
      return <Globe className="h-5 w-5" />;
    default:
      return <Monitor className="h-5 w-5" />;
  }
}

function statusBadge(status: string) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    pending: 'secondary',
    revoked: 'destructive',
    expired: 'outline',
  };
  return (
    <Badge variant={variants[status] || 'outline'}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function DeviceList({ devices: initialDevices }: { devices: Device[] }) {
  const router = useRouter();
  const [devices, setDevices] = useState(initialDevices);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<Device | null>(null);
  const [renameLabel, setRenameLabel] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<Device | null>(null);

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Copied to clipboard');
  }

  async function revokeDevice(device: Device) {
    const res = await fetch(`/api/devices/${device.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'revoked' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDevices((prev) => prev.map((d) => (d.id === device.id ? updated : d)));
      toast.success('Device revoked');
    } else {
      toast.error('Failed to revoke device');
    }
  }

  async function reactivateDevice(device: Device) {
    const res = await fetch(`/api/devices/${device.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDevices((prev) => prev.map((d) => (d.id === device.id ? updated : d)));
      toast.success('Device reactivated');
    } else {
      toast.error('Failed to reactivate device');
    }
  }

  async function renameDevice() {
    if (!renameDialog || !renameLabel.trim()) return;
    const res = await fetch(`/api/devices/${renameDialog.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_label: renameLabel.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDevices((prev) => prev.map((d) => (d.id === renameDialog.id ? updated : d)));
      toast.success('Device renamed');
      setRenameDialog(null);
    } else {
      toast.error('Failed to rename device');
    }
  }

  async function deleteDevice() {
    if (!deleteDialog) return;
    const res = await fetch(`/api/devices/${deleteDialog.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setDevices((prev) => prev.filter((d) => d.id !== deleteDialog.id));
      toast.success('Device deleted');
      setDeleteDialog(null);
    } else {
      toast.error('Failed to delete device');
    }
  }

  if (devices.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Monitor className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No devices linked</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the PlaylistHub app on your device to register it automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {devices.map((device) => (
          <Card key={device.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    {platformIcon(device.platform)}
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {device.device_label || 'Unnamed Device'}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {device.platform.toUpperCase()} · {device.model || 'Unknown model'}
                    </CardDescription>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameLabel(device.device_label || '');
                        setRenameDialog(device);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        copyToClipboard(device.activation_code, `code-${device.id}`)
                      }
                    >
                      <QrCode className="mr-2 h-4 w-4" />
                      Copy Activation Code
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        copyToClipboard(device.id, `id-${device.id}`)
                      }
                    >
                      {copiedId === `id-${device.id}` ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      Copy Device ID
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {device.status === 'active' ? (
                      <DropdownMenuItem
                        onClick={() => revokeDevice(device)}
                        className="text-destructive"
                      >
                        <ShieldOff className="mr-2 h-4 w-4" />
                        Revoke Access
                      </DropdownMenuItem>
                    ) : device.status === 'revoked' ? (
                      <DropdownMenuItem onClick={() => reactivateDevice(device)}>
                        <Shield className="mr-2 h-4 w-4" />
                        Reactivate
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onClick={() => setDeleteDialog(device)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Device
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                {statusBadge(device.status)}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Activation Code
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      device.activation_code,
                      `code-${device.id}`
                    )
                  }
                  className="flex items-center gap-1.5 font-mono text-sm font-semibold tracking-wider hover:text-primary transition-colors"
                >
                  {device.activation_code}
                  {copiedId === `code-${device.id}` ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Registered
                </span>
                <span className="text-xs">
                  {new Date(device.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Last Seen</span>
                <span className="text-xs">{relativeTime(device.last_seen_at)}</span>
              </div>

              {device.app_version && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Version</span>
                  <span className="text-xs">{device.app_version}</span>
                </div>
              )}

              {device.reinstall_count > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Reinstalls
                  </span>
                  <span className="text-xs">{device.reinstall_count}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rename Dialog */}
      <Dialog
        open={!!renameDialog}
        onOpenChange={(open) => !open && setRenameDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Device</DialogTitle>
            <DialogDescription>
              Give this device a friendly name.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameLabel}
            onChange={(e) => setRenameLabel(e.target.value)}
            placeholder="e.g. Living Room Apple TV"
            maxLength={100}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>
              Cancel
            </Button>
            <Button onClick={renameDevice} disabled={!renameLabel.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteDialog}
        onOpenChange={(open) => !open && setDeleteDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Device</DialogTitle>
            <DialogDescription>
              This will permanently remove &quot;{deleteDialog?.device_label || 'this device'}&quot; and
              all its linked playlists. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteDevice}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
