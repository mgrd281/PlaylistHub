'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, ListMusic, Tv, Film, Clapperboard, LayoutGrid,
  Heart, Clock, History, Smartphone, Settings, LogOut,
  Menu, Sun, Moon, Play,
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
  shortcut?: boolean;
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
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
        <Play className="h-3.5 w-3.5 text-black fill-black ml-0.5" />
      </div>
      <span className="text-sm font-bold tracking-tight">PlaylistHub</span>
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
        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150',
        active
          ? 'bg-white/[0.08] text-white'
          : disabled
          ? 'text-white/25 cursor-default'
          : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
      )}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-white" />
      )}

      <item.icon className={cn(
        'h-[16px] w-[16px] shrink-0',
        active ? 'text-white' : disabled ? 'text-white/20' : 'text-white/40 group-hover:text-white/60'
      )} />

      <span className="flex-1 truncate">{item.name}</span>

      {item.badge && (
        <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.05] text-white/25">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

/* ─── Section Label ─── */

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-6 pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/20">
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
    <div className="p-3 space-y-1">
      <Separator className="opacity-[0.06] mb-2" />

      <button
        type="button"
        onClick={toggleTheme}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-white/50 hover:bg-white/[0.04] hover:text-white/80 transition-all duration-150"
      >
        {isDark ? <Sun className="h-4 w-4 text-white/40" /> : <Moon className="h-4 w-4 text-white/40" />}
        <span className="flex-1 text-left">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
      </button>

      <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-2.5 mt-1">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-[10px] font-bold bg-white/[0.08] text-white/60">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white/70 truncate">{username}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
          onClick={onLogout}
        >
          <LogOut className="h-3 w-3" />
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
      <BrandMark />

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

      <UserFooter onLogout={handleLogout} />
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-[240px] lg:flex-col">
        <div className="flex grow flex-col overflow-y-auto border-r border-white/[0.06] bg-[#0a0a0a]">
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile top bar + sheet */}
      <div className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-xl px-4 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger>
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] p-0 border-r border-white/[0.06] bg-[#0a0a0a]">
            {sidebarContent}
          </SheetContent>
        </Sheet>
        <BrandMark compact />
      </div>
    </>
  );
}
