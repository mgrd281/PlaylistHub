'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, Loader2, AlertCircle,
  Shield, ShieldOff, ListMusic, Smartphone, Tv, Film, Clapperboard,
  Clock, Wifi, WifiOff, Globe, RefreshCw,
  Monitor, Tablet, Phone,
} from 'lucide-react';
import type { Playlist, Device } from '@/types/database';

interface CustomerDetail {
  profile: {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    created_at: string;
    updated_at: string;
  };
  playlists: Playlist[];
  devices: Device[];
  sessions: {
    id: string;
    device_id: string;
    started_at: string;
    last_heartbeat_at: string;
    ip_address: string | null;
    app_version: string | null;
    ended_at: string | null;
  }[];
  activations: {
    id: string;
    device_id: string;
    activation_type: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  }[];
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function platformIcon(platform: string) {
  if (platform === 'ios' || platform === 'tvos') return Phone;
  if (platform === 'android') return Tablet;
  return Monitor;
}

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingRole, setTogglingRole] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/customers/${customerId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleRole() {
    if (!data) return;
    const newRole = data.profile.role === 'admin' ? 'user' : 'admin';
    setTogglingRole(true);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      setData(prev => prev ? { ...prev, profile: { ...prev.profile, role: newRole } } : prev);
    } catch { /* ignore */ }
    setTogglingRole(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-3" />
        <p className="text-sm text-muted-foreground">{error || 'Customer not found'}</p>
        <Link href="/customers" className="text-xs text-primary hover:underline mt-3">
          Back to customers
        </Link>
      </div>
    );
  }

  const { profile, playlists, devices, sessions, activations } = data;
  const username = profile.display_name || profile.email.split('@')[0];
  const initials = username.slice(0, 2).toUpperCase();

  const totalChannels = playlists.reduce((s, p) => s + (p.channels_count ?? 0), 0);
  const totalMovies = playlists.reduce((s, p) => s + (p.movies_count ?? 0), 0);
  const totalSeries = playlists.reduce((s, p) => s + (p.series_count ?? 0), 0);
  const activeDevices = devices.filter(d => d.status === 'active').length;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + Header */}
      <div>
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ChevronLeft className="h-4 w-4" /> Customers
        </Link>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-lg font-bold text-muted-foreground">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{username}</h1>
              {profile.role === 'admin' && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
                  <Shield className="h-3 w-3" /> Admin
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Joined {formatDate(profile.created_at)}
            </p>
          </div>

          {/* Admin actions */}
          <div className="shrink-0 flex gap-2">
            <button
              onClick={toggleRole}
              disabled={togglingRole}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                profile.role === 'admin'
                  ? 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10'
                  : 'border-border text-muted-foreground hover:bg-muted'
              } disabled:opacity-50`}
            >
              {togglingRole ? <Loader2 className="h-3 w-3 animate-spin" /> :
                profile.role === 'admin' ? <ShieldOff className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
              {profile.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
            </button>
            <button
              onClick={load}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={ListMusic} label="Playlists" value={playlists.length} />
        <StatCard icon={Smartphone} label="Devices" value={`${activeDevices}/${devices.length}`} sub="active" />
        <StatCard icon={Tv} label="Channels" value={totalChannels} />
        <StatCard icon={Film} label="Movies" value={totalMovies} extra={totalSeries > 0 ? `+ ${totalSeries} series` : undefined} />
      </div>

      {/* Playlists */}
      <Section title="Playlists" icon={ListMusic} count={playlists.length}>
        {playlists.length === 0 ? (
          <EmptyState text="No playlists" />
        ) : (
          <div className="space-y-1.5">
            {playlists.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span>{p.type}</span>
                    <span>{p.channels_count} ch</span>
                    <span>{p.movies_count} mov</span>
                    <span>{p.series_count} ser</span>
                    {p.last_scan_at && <span>Scanned {timeAgo(p.last_scan_at)}</span>}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground shrink-0">{formatDate(p.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Devices */}
      <Section title="Devices" icon={Smartphone} count={devices.length}>
        {devices.length === 0 ? (
          <EmptyState text="No devices" />
        ) : (
          <div className="space-y-1.5">
            {devices.map(d => {
              const PlatIcon = platformIcon(d.platform);
              const isActive = d.status === 'active';
              return (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isActive ? 'bg-green-500/10' : 'bg-muted'
                  }`}>
                    <PlatIcon className={`h-4 w-4 ${isActive ? 'text-green-500' : 'text-muted-foreground/50'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{d.device_label || d.model || d.platform}</p>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span className="capitalize">{d.platform}</span>
                      {d.os_version && <span>{d.os_version}</span>}
                      {d.app_version && <span>v{d.app_version}</span>}
                      {d.reinstall_count > 0 && <span className="text-amber-500">{d.reinstall_count} reinstall(s)</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {isActive ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-muted-foreground/40" />}
                      {timeAgo(d.last_seen_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Recent Sessions */}
      <Section title="Recent Sessions" icon={Globe} count={sessions.length}>
        {sessions.length === 0 ? (
          <EmptyState text="No sessions recorded" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                  <th className="pb-2 pr-4 font-medium">Started</th>
                  <th className="pb-2 pr-4 font-medium">Last Heartbeat</th>
                  <th className="pb-2 pr-4 font-medium">IP</th>
                  <th className="pb-2 pr-4 font-medium">Version</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {sessions.map(s => (
                  <tr key={s.id} className="text-[12px]">
                    <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(s.started_at)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{timeAgo(s.last_heartbeat_at)}</td>
                    <td className="py-2 pr-4 font-mono text-muted-foreground/70 text-[11px]">{s.ip_address || '—'}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.app_version || '—'}</td>
                    <td className="py-2">
                      {s.ended_at ? (
                        <span className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 py-0.5 rounded">Ended</span>
                      ) : (
                        <span className="text-[10px] text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded font-medium">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Recent Activations */}
      <Section title="Activations" icon={Clock} count={activations.length}>
        {activations.length === 0 ? (
          <EmptyState text="No activations" />
        ) : (
          <div className="space-y-1.5">
            {activations.map(a => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-[12px]">
                <span className="capitalize text-muted-foreground font-medium">{a.activation_type}</span>
                <span className="text-muted-foreground/50">·</span>
                <span className="font-mono text-muted-foreground/60 text-[11px]">{a.ip_address || '—'}</span>
                <span className="flex-1" />
                <span className="text-muted-foreground/50">{formatDateTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, count, children }: {
  title: string; icon: React.ElementType; count: number; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-muted-foreground/50" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-muted-foreground/50 tabular-nums">({count})</span>
      </div>
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, extra }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; extra?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-muted-foreground/40" />
        <span className="text-xl font-bold tracking-tight">{value}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">
        {label}{sub && <span className="text-muted-foreground/50 ml-1">({sub})</span>}
      </p>
      {extra && <p className="text-[10px] text-muted-foreground/40 mt-0.5">{extra}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'text-green-500 bg-green-500/10',
    pending: 'text-amber-500 bg-amber-500/10',
    scanning: 'text-blue-500 bg-blue-500/10',
    error: 'text-red-500 bg-red-500/10',
    revoked: 'text-red-500 bg-red-500/10',
    expired: 'text-muted-foreground bg-muted',
    inactive: 'text-muted-foreground bg-muted',
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${colors[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground/50 rounded-xl border border-dashed border-border/40">
      {text}
    </div>
  );
}
