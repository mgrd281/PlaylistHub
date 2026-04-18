'use client';

import { Playlist } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { ListMusic, Tv, Film, Clapperboard, Activity } from 'lucide-react';

interface DashboardStatsProps {
  playlists: Playlist[];
}

export function DashboardStats({ playlists }: DashboardStatsProps) {
  const totalPlaylists = playlists.length;
  const activePlaylists = playlists.filter(p => p.status === 'active').length;
  const totalChannels = playlists.reduce((sum, p) => sum + p.channels_count, 0);
  const totalMovies = playlists.reduce((sum, p) => sum + p.movies_count, 0);
  const totalSeries = playlists.reduce((sum, p) => sum + p.series_count, 0);
  const totalItems = playlists.reduce((sum, p) => sum + p.total_items, 0);

  const stats = [
    {
      label: 'Total Playlists',
      value: totalPlaylists,
      sublabel: `${activePlaylists} active`,
      icon: ListMusic,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      label: 'Total Items',
      value: totalItems,
      sublabel: 'across all playlists',
      icon: Activity,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950',
    },
    {
      label: 'Channels',
      value: totalChannels,
      sublabel: 'live streams',
      icon: Tv,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-950',
    },
    {
      label: 'Movies',
      value: totalMovies,
      sublabel: 'on demand',
      icon: Film,
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950',
    },
    {
      label: 'Series',
      value: totalSeries,
      sublabel: 'episodes',
      icon: Clapperboard,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.label} className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  {stat.value.toLocaleString()}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.sublabel}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
