'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, MonitorSmartphone, ShieldCheck, Wifi } from 'lucide-react';

export default function ManagePage() {
  const [mac, setMac] = useState('');
  const [deviceKey, setDeviceKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function formatMac(value: string) {
    const clean = value.replace(/[^a-fA-F0-9]/g, '').slice(0, 12);
    const parts = clean.match(/.{1,2}/g);
    return parts ? parts.join(':').toUpperCase() : '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleanMac = mac.replace(/[^a-fA-F0-9]/g, '');
    if (cleanMac.length !== 12) {
      setError('Please enter a valid MAC address (12 hex characters).');
      return;
    }
    if (!deviceKey.trim()) {
      setError('Device Key is required.');
      return;
    }

    setLoading(true);
    try {
      // TODO: wire to actual API
      await new Promise((r) => setTimeout(r, 1500));
      // router.push(`/playlists?mac=${cleanMac}&key=${deviceKey}`);
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0e14]">
      {/* ─── Hero Section ─── */}
      <section className="relative flex min-h-[420px] items-center justify-center overflow-hidden lg:min-h-[480px]">
        {/* Background gradient layers */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1923] via-[#121a2b] to-[#0b0e14]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,rgba(56,117,255,0.12)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.06)_0%,transparent_50%)]" />

        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0b0e14] to-transparent" />

        {/* Hero content */}
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04] shadow-lg backdrop-blur-sm">
            <Image
              src="/brand/playmy-icon.svg"
              alt="PlaylistHub"
              width={36}
              height={36}
              className="brightness-0 invert opacity-90"
              priority
            />
          </div>

          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            Manage Your{' '}
            <span className="bg-gradient-to-r from-blue-400 via-blue-300 to-violet-400 bg-clip-text text-transparent">
              Playlists
            </span>
          </h1>

          <p className="max-w-lg text-base leading-relaxed text-white/45 sm:text-lg">
            Link your device to access, organize, and stream your playlists.
            Enter your credentials below to get started.
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: ShieldCheck, label: 'Secure Connection' },
              { icon: MonitorSmartphone, label: 'Multi-Device' },
              { icon: Wifi, label: 'Instant Sync' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/50"
              >
                <Icon className="h-3.5 w-3.5 text-blue-400/70" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Form Section ─── */}
      <section className="relative z-10 -mt-8 pb-24">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-2xl border border-white/[0.06] bg-[#12161f] p-8 shadow-2xl shadow-black/40 sm:p-10">
            {/* Form header */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold tracking-tight text-white">
                Device Login
              </h2>
              <p className="mt-1 text-sm text-white/40">
                Enter your device details to link your playlist.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* MAC Address */}
              <div className="space-y-2">
                <label htmlFor="mac" className="block text-sm font-medium text-white/60">
                  MAC Address
                </label>
                <input
                  id="mac"
                  type="text"
                  placeholder="00:1A:2B:3C:4D:5E"
                  value={mac}
                  onChange={(e) => setMac(formatMac(e.target.value))}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-sm tracking-wider text-white placeholder:text-white/20 transition-colors focus:border-blue-500/40 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                />
                <p className="text-xs text-white/25">
                  Usually found in your device settings or on the device label.
                </p>
              </div>

              {/* Device Key */}
              <div className="space-y-2">
                <label htmlFor="deviceKey" className="block text-sm font-medium text-white/60">
                  Device Key
                </label>
                <input
                  id="deviceKey"
                  type="text"
                  placeholder="Enter your device key"
                  value={deviceKey}
                  onChange={(e) => setDeviceKey(e.target.value)}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/20 transition-colors focus:border-blue-500/40 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                />
                <p className="text-xs text-white/25">
                  The unique key assigned to your device for secure access.
                </p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:from-blue-500 hover:to-blue-400 hover:shadow-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2 focus:ring-offset-[#12161f] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  'Connect Device'
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="my-8 h-px bg-white/[0.05]" />

            {/* Help */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                <ShieldCheck className="h-4 w-4 text-white/30" />
              </div>
              <div>
                <p className="text-xs font-medium text-white/40">
                  Secure & Encrypted
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/25">
                  Your device credentials are transmitted securely. We never store your data in plain text.
                </p>
              </div>
            </div>
          </div>

          {/* Footer tagline */}
          <p className="mt-8 text-center text-xs text-white/20">
            PlaylistHub — Stream smarter, not harder.
          </p>
        </div>
      </section>
    </div>
  );
}
