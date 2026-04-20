'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

/* ─── Poster data: position, size, blur, rotation, depth layer ─── */
const POSTERS: PosterConfig[] = [
  // Left side
  { x: '3%',  y: '8%',   w: 120, h: 170, rot: -6,  blur: 4,  opacity: 0.35, delay: 0,    drift: 'a' },
  { x: '5%',  y: '55%',  w: 100, h: 145, rot: 4,   blur: 6,  opacity: 0.25, delay: 0.8,  drift: 'b' },
  { x: '12%', y: '78%',  w: 130, h: 185, rot: -3,  blur: 2,  opacity: 0.45, delay: 0.3,  drift: 'c' },
  { x: '1%',  y: '35%',  w: 90,  h: 130, rot: 8,   blur: 8,  opacity: 0.2,  delay: 1.2,  drift: 'd' },
  // Right side
  { x: '82%', y: '5%',   w: 115, h: 165, rot: 5,   blur: 3,  opacity: 0.4,  delay: 0.5,  drift: 'b' },
  { x: '85%', y: '50%',  w: 105, h: 150, rot: -7,  blur: 5,  opacity: 0.3,  delay: 1.0,  drift: 'a' },
  { x: '78%', y: '75%',  w: 135, h: 190, rot: 3,   blur: 1,  opacity: 0.5,  delay: 0.2,  drift: 'd' },
  { x: '88%', y: '28%',  w: 85,  h: 125, rot: -4,  blur: 7,  opacity: 0.22, delay: 1.5,  drift: 'c' },
  // Top center area (far from center)
  { x: '30%', y: '2%',   w: 95,  h: 135, rot: -2,  blur: 5,  opacity: 0.28, delay: 0.7,  drift: 'c' },
  { x: '60%', y: '1%',   w: 110, h: 155, rot: 3,   blur: 4,  opacity: 0.32, delay: 0.4,  drift: 'a' },
  // Bottom edges
  { x: '25%', y: '82%',  w: 100, h: 145, rot: 5,   blur: 3,  opacity: 0.35, delay: 0.9,  drift: 'b' },
  { x: '65%', y: '85%',  w: 110, h: 160, rot: -4,  blur: 2,  opacity: 0.4,  delay: 0.6,  drift: 'd' },
];

/* ─── Poster color palettes (cinematic gradients) ─── */
const PALETTE = [
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
];

interface PosterConfig {
  x: string; y: string;
  w: number; h: number;
  rot: number; blur: number;
  opacity: number; delay: number;
  drift: 'a' | 'b' | 'c' | 'd';
}

export default function StatusPage() {
  const [mounted, setMounted] = useState(false);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleMouseMove(e: React.MouseEvent) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    // Normalize to -1..1 range, damped
    setMouseOffset({
      x: ((e.clientX - rect.left - cx) / cx) * 0.3,
      y: ((e.clientY - rect.top - cy) / cy) * 0.3,
    });
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#f8f7f4]"
    >
      {/* Subtle radial glow behind center */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.02)_0%,_transparent_70%)]" />

      {/* ─── Floating Posters Layer ─── */}
      <div className="pointer-events-none absolute inset-0">
        {POSTERS.map((p, i) => (
          <FloatingPoster
            key={i}
            config={p}
            palette={PALETTE[i % PALETTE.length]}
            index={i}
            mouseOffset={mouseOffset}
            visible={mounted}
          />
        ))}
      </div>

      {/* ─── Center Status Card ─── */}
      <div
        className="relative z-10 flex flex-col items-center transition-all duration-1000 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
        }}
      >
        {/* Logo */}
        <div className="mb-8">
          <Image
            src="/brand/playmy-icon.svg"
            alt="PlaylistHub"
            width={56}
            height={56}
            className="opacity-80"
            priority
          />
        </div>

        {/* Glass card */}
        <div className="flex w-[380px] flex-col items-center rounded-2xl border border-black/[0.06] bg-white/70 px-10 py-10 shadow-[0_8px_60px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          {/* Progress ring */}
          <div className="relative mb-6">
            <svg width="80" height="80" viewBox="0 0 80 80" className="rotate-[-90deg]">
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="#e8e6e1"
                strokeWidth="4"
              />
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="#1a1a1a"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - 0.72)}`}
                className="transition-all duration-1000 ease-out"
                style={{
                  strokeDashoffset: mounted
                    ? `${2 * Math.PI * 34 * (1 - 0.72)}`
                    : `${2 * Math.PI * 34}`,
                }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tracking-tight text-[#1a1a1a]">
              72%
            </span>
          </div>

          {/* Status title */}
          <h1 className="mb-2 text-center text-xl font-semibold tracking-tight text-[#1a1a1a]">
            Setting things up
          </h1>

          {/* Description */}
          <p className="mb-6 max-w-[280px] text-center text-[13px] leading-relaxed text-[#7a7870]">
            We&apos;re preparing your media library. This usually takes just a moment.
          </p>

          {/* Animated dots */}
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-[#1a1a1a]/40" />
            <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_0.2s_infinite] rounded-full bg-[#1a1a1a]/40" />
            <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_0.4s_infinite] rounded-full bg-[#1a1a1a]/40" />
          </div>
        </div>

        {/* Notify message */}
        <p className="mt-6 text-[12px] tracking-wide text-[#b0ada5]">
          We&apos;ll notify you when everything is ready.
        </p>
      </div>

      {/* ─── Animation keyframes ─── */}
      <style jsx global>{`
        @keyframes drift-a {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(6px, -8px); }
          50%      { transform: translate(-4px, -14px); }
          75%      { transform: translate(8px, -5px); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(-8px, 5px); }
          50%      { transform: translate(6px, 10px); }
          75%      { transform: translate(-5px, -6px); }
        }
        @keyframes drift-c {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(10px, 4px); }
          50%      { transform: translate(3px, -10px); }
          75%      { transform: translate(-7px, 6px); }
        }
        @keyframes drift-d {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(-5px, -10px); }
          50%      { transform: translate(8px, 6px); }
          75%      { transform: translate(-3px, 10px); }
        }
      `}</style>
    </div>
  );
}

/* ─── Floating Poster Component ─── */
function FloatingPoster({
  config,
  palette,
  index,
  mouseOffset,
  visible,
}: {
  config: PosterConfig;
  palette: string[];
  index: number;
  mouseOffset: { x: number; y: number };
  visible: boolean;
}) {
  // Parallax depth: more blur = further = less movement
  const depth = 1 - config.blur / 10;
  const px = mouseOffset.x * depth * 12;
  const py = mouseOffset.y * depth * 12;

  // Stagger entry
  const entryDelay = config.delay + 0.15;

  return (
    <div
      className="absolute"
      style={{
        left: config.x,
        top: config.y,
        width: config.w,
        height: config.h,
        opacity: visible ? config.opacity : 0,
        filter: `blur(${config.blur}px)`,
        transform: `rotate(${config.rot}deg) translate(${px}px, ${py}px)`,
        transition: `opacity 0.8s ease-out ${entryDelay}s, transform 0.15s ease-out`,
      }}
    >
      {/* Drift wrapper */}
      <div
        style={{
          width: '100%',
          height: '100%',
          animation: `drift-${config.drift} ${18 + index * 1.5}s ease-in-out infinite`,
          animationDelay: `${-index * 2.3}s`,
        }}
      >
        {/* Poster card */}
        <div
          className="h-full w-full overflow-hidden rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.12)]"
          style={{
            background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]}, ${palette[2]})`,
          }}
        >
          {/* Film-like inner detail */}
          <div className="flex h-full w-full flex-col justify-end p-3">
            {/* Fake title lines */}
            <div
              className="mb-1.5 rounded-sm"
              style={{
                width: '65%',
                height: 6,
                backgroundColor: 'rgba(255,255,255,0.15)',
              }}
            />
            <div
              className="rounded-sm"
              style={{
                width: '40%',
                height: 4,
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
