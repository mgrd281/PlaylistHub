'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, ListMusic, Tv, Film, Clapperboard, LayoutGrid,
  Heart, Clock, History, Smartphone, Settings, LogOut,
  Menu, Sun, Moon, Play, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/* ─── Navigation structure ─── */

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  matchExact?: boolean;
  shortcut?: boolean; // quick-access links that don't show active state
}

interface NavSection {
  label: string | null;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { name: 'Home', href: '/dashboard', icon: Home, matchExact: true },
    ],
  },
  {
    label: 'BROWSE',
    items: [
      { name: 'Live TV', href: '/playlists', icon: Tv, shortcut: true },
      { name: 'Movies', href: '/playlists', icon: Film, shortcut: true },
      { name: 'Series', href: '/playlists', icon: Clapperboard, shortcut: true },
      { name: 'Categories', href: '/playlists', icon: LayoutGrid, shortcut: true },
    ],
  },
  {
    label: 'MY LIBRARY',
    items: [
      { name: 'Playlists', href: '/playlists', icon: ListMusic },
      { name: 'Favorites', href: '#', icon: Heart, badge: 'Soon' },
      { name: 'Watch Later', href: '#', icon: Clock, badge: 'Soon' },
      { name: 'History', href: '#', icon: History, badge: 'Soon' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { name: 'Devices', href: '/devices', icon: Smartphone },
      { name: 'Settings', href: '#', icon: Settings, badge: 'Soon' },
    ],
  },
];

/* ─── Helpers ─── */

function checkActive(href: string, pathname: string, matchExact?: boolean, shortcut?: boolean) {
  if (shortcut || href === '#') return false;
  if (matchExact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

/* ─── Brand Mark ─── */

function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', compact ? '' : 'px-5 py-5')}>
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 shadow-lg shadow-violet-500/25">
        <Play className="h-4 w-4 text-white fill-white ml-0.5" />
        <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-[var(--sidebar-bg,hsl(var(--card)))]" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-bold tracking-tight leading-none">PlaylistHub</span>
        <span className="text-[10px] text-muted-foreground/60 font-medium tracking-wide mt-0.5">STREAMING</span>
      </div>
    </div>
  );
}

/* ─── Nav Item ─── */

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = checkActive(item.href, pathname, item.matchExact, item.shortcut);
  const disabled = item.href === '#';

  return (
    <Link
      href={disabled ? '#' : item.href}
      onClick={(e) => {
        if (disabled) e.preventDefault();
        onNavigate?.();
      }}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200',
        active
          ? 'bg-white/[0.08] text-foreground'
          : disabled
          ? 'text-muted-foreground/40 cursor-default'
          : 'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground'
      )}
    >
      {/* Active indicator bar */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-gradient-to-b from-violet-400 to-purple-500" />
      )}

      <item.icon className={cn(
        'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
        active ? 'text-violet-400' : disabled ? 'text-muted-foreground/30' : 'text-muted-foreground/70 group-hover:text-muted-foreground'
      )} />

      <span className="flex-1 truncate">{item.name}</span>

      {item.badge && (
        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground/40">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

/* ─── Section Label ─── */

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/40">
        {label}
      </span>
    </div>
  );
}

/* ─── User Footer ─── */

function UserFooter({ onLogout }: { onLogout: () => void }) {
  const [email, setEmail] = useState('');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email || '');
    });
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggleTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      setIsDark(false);
      localStorage.setItem('theme', 'light');
    } else {
      html.classList.add('dark');
      setIsDark(true);
      localStorage.setItem('theme', 'dark');
    }
  }

  const username = email ? email.split('@')[0] : 'User';
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="p-3 space-y-2">
      <Separator className="opacity-[0.06]" />

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-all duration-200"
      >
        {isDark ? <Sun className="h-[18px] w-[18px] text-muted-foreground/70" /> : <Moon className="h-[18px] w-[18px] text-muted-foreground/70" />}
        <span className="flex-1 text-left">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
      </button>

      {/* User card */}
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
        <Avatar className="h-8 w-8 ring-2 ring-white/[0.08]">
          <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-violet-500/20 to-purple-600/20 text-violet-300">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{username}</p>
          <p className="text-[10px] text-muted-foreground/50 truncate">{email || 'Loading...'}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10"
          onClick={onLogout}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Main Sidebar Export ─── */

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Brand */}
      <BrandMark />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-2 pb-2">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si}>
            {section.label && <SectionLabel label={section.label} />}
            <nav className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.name}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </div>
        ))}
      </div>

      {/* User footer */}
      <UserFooter onLogout={handleLogout} />
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-[260px] lg:flex-col">
        <div className="flex grow flex-col overflow-y-auto border-r border-white/[0.06] bg-card">
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile top bar + sheet */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-card/95 backdrop-blur-xl px-4 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger>
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] p-0 border-r border-white/[0.06]">
            {sidebarContent}
          </SheetContent>
        </Sheet>
        <BrandMark compact />
      </div>
    </>
  );
}
