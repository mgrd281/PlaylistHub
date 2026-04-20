'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { ListMusic, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import FloatingPostersLayout from '@/components/floating-posters';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Check if email confirmation is required
      setSuccess(true);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <FloatingPostersLayout>
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md border-white/[0.08] bg-black/50 shadow-[0_8px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
          <CardHeader className="space-y-4 pb-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <ListMusic className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Check your email</h1>
              <p className="mt-2 text-sm text-white/50">
                We&apos;ve sent a confirmation link to <strong>{email}</strong>.
                Click the link to activate your account.
              </p>
            </div>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" className="border-white/10 text-white hover:bg-white/10" onClick={() => router.push('/login')}>
              Back to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
      </FloatingPostersLayout>
    );
  }

  return (
    <FloatingPostersLayout>
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-white/[0.08] bg-black/50 shadow-[0_8px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
        <CardHeader className="space-y-4 pb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <ListMusic className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Create an account</h1>
            <p className="mt-1 text-sm text-white/50">
              Get started with PlaylistHub
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
                className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-white/70">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
                className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              />
            </div>
            <Button type="submit" className="w-full bg-white text-black hover:bg-white/90" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-white/40">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-white/70 hover:text-white hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
    </FloatingPostersLayout>
  );
}
