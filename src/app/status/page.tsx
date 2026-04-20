'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

/* ── Poster gradient palettes (cinematic film look) ── */
const PALETTES = [
  ['#1a1a2e', '#16213e', '#0f3460'],
  ['#2d1b69', '#11052c', '#3c096c'],
  ['#1b3a4b', '#065a60', '#0b525b'],
  ['#3d0000', '#6a040f', '#9d0208'],
  ['#240046', '#3c096c', '#5a189a'],
  ['#003049', '#005f73', '#0a9396'],
  ['#370617', '#6a040f', '#9d0208'],
  ['#1b263b', '#415a77', '#778da9'],
  ['#0d1b2a', '#1b263b', '#2b3a52'],
  ['#1a1a1a', '#2d2d2d', '#404040'],
  ['#14213d', '#1d3557', '#457b9d'],
  ['#2b2d42', '#3d405b', '#555b6e'],
  ['#0b132b', '#1c2541', '#3a506b'],
  ['#231942', '#5e548e', '#9f86c0'],
  ['#10002b', '#240046', '#3c096c'],
  ['#1b0a2e', '#2e1760', '#4a2c8a'],
  ['#0a1628', '#132f52', '#1e4d7a'],
  ['#2c0735', '#560e5e', '#7b2d8e'],
  ['#0b1e0b', '#1a3a1a', '#2d5a2d'],
  ['#2a0a0a', '#4a1616', '#6b2020'],
];

/* ── Column config: how many posters, speed multiplier, start offset ── */
const COLUMNS = [
  { count: 6, speed: 1.0, offset: 0 },
  { count: 7, speed: 0.75, offset: -30 },
  { count: 6, speed: 0.9, offset: -60 },
  { count: 7, speed: 0.65, offset: -15 },
  { count: 6, speed: 1.1, offset: -45 },
  { count: 7, speed: 0.8, offset: -25 },
];

function PosterCard({ palette, seed }: { palette: string[]; seed: number }) {
  const titleW = 50 + (seed % 30);
  const subW = 30 + (seed % 20);
  return (
    <div
      className="w-full shrink-0 overflow-hidden rounded-xl"
      style={{
        aspectRatio: '2/3',
        background: `linear-gradient(${135 + (seed % 40)}deg, ${palette[0]}, ${palette[1]}, ${palette[2]})`,
      }}
    >
      <div className="flex h-full flex-col justify-between p-3">
        {/* Top faux detail */}
        <div className="flex justify-end">
          <div className="h-4 w-8 rounded-sm" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        </div>
        {/* Bottom faux title */}
        <div>
          <div className="mb-1.5 rounded-sm" style={{ width: `${titleW}%`, height: 7, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <div className="rounded-sm" style={{ width: `${subW}%`, height: 5, backgroundColor: 'rgba(255,255,255,0.09)' }} />
        </div>
      </div>
    </div>
  );
}

function ScrollColumn({ colIdx, count, speed, offset }: { colIdx: number; count: number; speed: number; offset: number }) {
  const baseDuration = 35;
  const duration = baseDuration / speed;
  // Build poster list (doubled for seamless loop)
  const posters = Array.from({ length: count }, (_, i) => {
    const palIdx = (colIdx * 7 + i * 3) % PALETTES.length;
    return <PosterCard key={i} palette={PALETTES[palIdx]} seed={colIdx * 13 + i * 7} />;
  });

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        className="flex flex-col gap-3 animate-scroll-up"
        style={{
          animationDuration: `${duration}s`,
          transform: `translateY(${offset}%)`,
        }}
      >
        {/* Original set */}
        {posters}
        {/* Duplicate for seamless loop */}
        {posters.map((p, i) => (
          <PosterCard key={`dup-${i}`} palette={PALETTES[(colIdx * 7 + i * 3) % PALETTES.length]} seed={colIdx * 13 + i * 7} />
        ))}
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#0a0a0f]">
      {/* ── Scrolling poster columns ── */}
      <div className="absolute inset-0 flex gap-3 px-3 opacity-60">
        {COLUMNS.map((col, i) => (
          <ScrollColumn key={i} colIdx={i} count={col.count} speed={col.speed} offset={col.offset} />
        ))}
      </div>

      {/* ── Dark vignette overlay ── */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,10,15,0.3)_0%,rgba(10,10,15,0.85)_70%,rgba(10,10,15,0.95)_100%)]" />

      {/* ── Center status card ── */}
      <div
        className="relative z-10 flex flex-col items-center transition-all duration-1000 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
        }}
      >
        <div className="mb-8">
          <Image src="/brand/playmy-icon.svg" alt="PlaylistHub" width={56} height={56} className="brightness-0 invert opacity-80" priority />
        </div>

        <div className="flex w-[380px] flex-col items-center rounded-2xl border border-white/[0.08] bg-black/50 px-10 py-10 shadow-[0_8px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
          <div className="relative mb-6">
            <svg width="80" height="80" viewBox="0 0 80 80" className="rotate-[-90deg]">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
              <circle
                cx="40" cy="40" r="34"
                fill="none" stroke="white" strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={mounted ? `${2 * Math.PI * 34 * 0.28}` : `${2 * Math.PI * 34}`}
                className="transition-all duration-[1.5s] ease-out"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tracking-tight text-white">
              72%
            </span>
          </div>

          <h1 className="mb-2 text-center text-xl font-semibold tracking-tight text-white">
            Setting things up
          </h1>
          <p className="mb-6 max-w-[280px] text-center text-[13px] leading-relaxed text-white/50">
            We&apos;re preparing your media library. This usually takes just a moment.
          </p>

          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-white/40" />
            <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_0.2s_infinite] rounded-full bg-white/40" />
            <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_0.4s_infinite] rounded-full bg-white/40" />
          </div>
        </div>

        <p className="mt-6 text-[12px] tracking-wide text-white/30">
          We&apos;ll notify you when everything is ready.
        </p>
      </div>

      {/* ── Scroll animation ── */}
      <style jsx global>{`
        @keyframes scroll-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .animate-scroll-up {
          animation: scroll-up linear infinite;
        }
      `}</style>
    </div>
  );
}
