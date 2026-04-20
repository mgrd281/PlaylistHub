'use client';

import { useEffect, useState } from 'react';

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

const COLUMNS = [
  { count: 6, speed: 1.0,  offset: 0 },
  { count: 7, speed: 0.75, offset: -30 },
  { count: 6, speed: 0.9,  offset: -60 },
  { count: 7, speed: 0.65, offset: -15 },
  { count: 6, speed: 1.1,  offset: -45 },
  { count: 7, speed: 0.8,  offset: -25 },
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
        <div className="flex justify-end">
          <div className="h-4 w-8 rounded-sm" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        </div>
        <div>
          <div className="mb-1.5 rounded-sm" style={{ width: `${titleW}%`, height: 7, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <div className="rounded-sm" style={{ width: `${subW}%`, height: 5, backgroundColor: 'rgba(255,255,255,0.09)' }} />
        </div>
      </div>
    </div>
  );
}

function ScrollColumn({ colIdx, count, speed, offset }: { colIdx: number; count: number; speed: number; offset: number }) {
  const duration = 35 / speed;
  const posters = Array.from({ length: count }, (_, i) => {
    const palIdx = (colIdx * 7 + i * 3) % PALETTES.length;
    return <PosterCard key={i} palette={PALETTES[palIdx]} seed={colIdx * 13 + i * 7} />;
  });

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        className="flex flex-col gap-3 animate-scroll-up"
        style={{ animationDuration: `${duration}s`, transform: `translateY(${offset}%)` }}
      >
        {posters}
        {posters.map((_, i) => (
          <PosterCard key={`dup-${i}`} palette={PALETTES[(colIdx * 7 + i * 3) % PALETTES.length]} seed={colIdx * 13 + i * 7} />
        ))}
      </div>
    </div>
  );
}

export default function FloatingPostersLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0a0a0f]">
      {/* Scrolling poster columns */}
      <div className="absolute inset-0 flex gap-3 px-3 opacity-60">
        {COLUMNS.map((col, i) => (
          <ScrollColumn key={i} colIdx={i} count={col.count} speed={col.speed} offset={col.offset} />
        ))}
      </div>

      {/* Dark vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,10,15,0.3)_0%,rgba(10,10,15,0.85)_70%,rgba(10,10,15,0.95)_100%)]" />

      {/* Content */}
      <div
        className="relative z-10 w-full transition-all duration-700 ease-out"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)' }}
      >
        {children}
      </div>

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
