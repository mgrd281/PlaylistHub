'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  const [email, setEmail] = useState<string>('');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email || '');
    });

    // Check initial theme
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

  const initials = email
    ? email.split('@')[0].slice(0, 2).toUpperCase()
    : '??';

  return (
    <header className="flex h-16 items-center justify-end gap-3 border-b bg-card px-6">
      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium sm:inline-block">
          {email ? email.split('@')[0] : 'User'}
        </span>
      </div>
    </header>
  );
}
