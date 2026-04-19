'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Users, Search, X, ChevronRight,
  Smartphone, ListMusic, Tv, Film, Clapperboard,
  Shield, Clock, Loader2, AlertCircle,
} from 'lucide-react';
import type { AdminCustomer } from '@/types/database';

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
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function CustomersView() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'last_activity' | 'playlists_count'>('created_at');

  useEffect(() => {
    fetch('/api/admin/customers')
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => { setCustomers(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    let list = customers;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.email.toLowerCase().includes(q) ||
        c.display_name?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'last_activity') {
        const aTime = a.last_activity ? new Date(a.last_activity).getTime() : 0;
        const bTime = b.last_activity ? new Date(b.last_activity).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === 'playlists_count') return b.playlists_count - a.playlists_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [customers, search, sortBy]);

  const stats = useMemo(() => ({
    total: customers.length,
    withPlaylists: customers.filter(c => c.playlists_count > 0).length,
    withDevices: customers.filter(c => c.devices_count > 0).length,
    activeToday: customers.filter(c => {
      if (!c.last_activity) return false;
      return Date.now() - new Date(c.last_activity).getTime() < 86400000;
    }).length,
  }), [customers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-3" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground">
              Manage all registered users
            </p>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={stats.total} icon={Users} />
        <StatCard label="With Playlists" value={stats.withPlaylists} icon={ListMusic} />
        <StatCard label="With Devices" value={stats.withDevices} icon={Smartphone} />
        <StatCard label="Active Today" value={stats.activeToday} icon={Clock} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-9 rounded-lg bg-muted/50 border border-border/60 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {(['created_at', 'last_activity', 'playlists_count'] as const).map(key => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                sortBy === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              }`}
            >
              {key === 'created_at' ? 'Newest' : key === 'last_activity' ? 'Active' : 'Playlists'}
            </button>
          ))}
        </div>
      </div>

      {/* Customer list */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No customers match your search' : 'No customers yet'}
            </p>
          </div>
        ) : (
          filtered.map(customer => (
            <CustomerRow key={customer.id} customer={customer} />
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-muted-foreground/50" />
        <span className="text-2xl font-bold tracking-tight">{value}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function CustomerRow({ customer: c }: { customer: AdminCustomer }) {
  const username = c.display_name || c.email.split('@')[0];
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <Link
      href={`/customers/${c.id}`}
      className="flex items-center gap-4 rounded-xl border border-border/50 bg-card hover:bg-accent/50 px-4 py-3 transition-all group"
    >
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{username}</span>
          {c.role === 'admin' && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
              <Shield className="h-2.5 w-2.5" /> Admin
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground truncate">{c.email}</p>
      </div>

      {/* Stats — hidden on small mobile */}
      <div className="hidden sm:flex items-center gap-4 shrink-0">
        <MiniStat icon={ListMusic} value={c.playlists_count} tooltip="Playlists" />
        <MiniStat icon={Tv} value={c.total_channels} tooltip="Channels" />
        <MiniStat icon={Film} value={c.total_movies} tooltip="Movies" />
        <MiniStat icon={Clapperboard} value={c.total_series} tooltip="Series" />
        <MiniStat icon={Smartphone} value={c.devices_count} tooltip="Devices" active={c.active_devices_count} />
      </div>

      {/* Last active */}
      <div className="text-right shrink-0 min-w-[60px]">
        <p className="text-[11px] text-muted-foreground">{timeAgo(c.last_activity)}</p>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
    </Link>
  );
}

function MiniStat({ icon: Icon, value, tooltip, active }: {
  icon: React.ElementType; value: number; tooltip: string; active?: number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground" title={tooltip}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
      <span className="text-xs tabular-nums font-medium">
        {value}
        {active !== undefined && active > 0 && (
          <span className="text-green-500 ml-0.5">({active})</span>
        )}
      </span>
    </div>
  );
}
