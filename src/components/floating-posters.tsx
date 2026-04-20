'use client';

import { useEffect, useRef, useState } from 'react';

/* ─── Poster layout: position, size, blur, rotation, opacity, drift variant ─── */
const POSTERS: PosterConfig[] = [
  // Left side
  { x: '2%',  y: '6%',   w: 120, h: 170, rot: -6,  blur: 4,  opacity: 0.3,  delay: 0,    drift: 'a' },
  { x: '4%',  y: '52%',  w: 100, h: 145, rot: 4,   blur: 6,  opacity: 0.2,  delay: 0.8,  drift: 'b' },
  { x: '10%', y: '76%',  w: 130, h: 185, rot: -3,  blur: 2,  opacity: 0.35, delay: 0.3,  drift: 'c' },
  { x: '0%',  y: '32%',  w: 90,  h: 130, rot: 8,   blur: 8,  opacity: 0.15, delay: 1.2,  drift: 'd' },
  // Right side
  { x: '82%', y: '4%',   w: 115, h: 165, rot: 5,   blur: 3,  opacity: 0.32, delay: 0.5,  drift: 'b' },
  { x: '84%', y: '48%',  w: 105, h: 150, rot: -7,  blur: 5,  opacity: 0.22, delay: 1.0,  drift: 'a' },
  { x: '77%', y: '73%',  w: 135, h: 190, rot: 3,   blur: 1,  opacity: 0.38, delay: 0.2,  drift: 'd' },
  { x: '88%', y: '26%',  w: 85,  h: 125, rot: -4,  blur: 7,  opacity: 0.16, delay: 1.5,  drift: 'c' },
  // Top
  { x: '28%', y: '1%',   w: 95,  h: 135, rot: -2,  blur: 5,  opacity: 0.2,  delay: 0.7,  drift: 'c' },
  { x: '62%', y: '0%',   w: 110, h: 155, rot: 3,   blur: 4,  opacity: 0.25, delay: 0.4,  drift: 'a' },
  // Bottom
  { x: '22%', y: '80%',  w: 100, h: 145, rot: 5,   blur: 3,  opacity: 0.28, delay: 0.9,  drift: 'b' },
  { x: '66%', y: '82%',  w: 110, h: 160, rot: -4,  blur: 2,  opacity: 0.32, delay: 0.6,  drift: 'd' },
];

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

/**
 * Cinematic floating-poster background layer.
 * Renders 12 movie-poster cards that gently drift with parallax on mouse move.
 * Wrap your page content inside this component.
 */
export default function FloatingPostersLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  function handleMouseMove(e: React.MouseEvent) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setMouse({
      x: ((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 0.25,
      y: ((e.clientY - r.top - r.height / 2) / (r.height / 2)) * 0.25,
    });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f8f7f4]"
    >
      {/* Soft radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.6)_0%,transparent_70%)]" />

      {/* Floating posters */}
      <div className="pointer-events-none absolute inset-0">
        {POSTERS.map((p, i) => (
          <Poster key={i} cfg={p} pal={PALETTE[i % PALETTE.length]} idx={i} mouse={mouse} show={mounted} />
        ))}
      </div>

      {/* Page content (centered, above posters) */}
      <div
        className="relative z-10 w-full transition-all duration-700 ease-out"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)' }}
      >
        {children}
      </div>

      {/* Drift keyframes */}
      <style jsx global>{`
        @keyframes drift-a {
          0%,100%{transform:translate(0,0)}
          25%{transform:translate(6px,-8px)}
          50%{transform:translate(-4px,-14px)}
          75%{transform:translate(8px,-5px)}
        }
        @keyframes drift-b {
          0%,100%{transform:translate(0,0)}
          25%{transform:translate(-8px,5px)}
          50%{transform:translate(6px,10px)}
          75%{transform:translate(-5px,-6px)}
        }
        @keyframes drift-c {
          0%,100%{transform:translate(0,0)}
          25%{transform:translate(10px,4px)}
          50%{transform:translate(3px,-10px)}
          75%{transform:translate(-7px,6px)}
        }
        @keyframes drift-d {
          0%,100%{transform:translate(0,0)}
          25%{transform:translate(-5px,-10px)}
          50%{transform:translate(8px,6px)}
          75%{transform:translate(-3px,10px)}
        }
      `}</style>
    </div>
  );
}

function Poster({ cfg, pal, idx, mouse, show }: {
  cfg: PosterConfig; pal: string[]; idx: number;
  mouse: { x: number; y: number }; show: boolean;
}) {
  const depth = 1 - cfg.blur / 10;
  const px = mouse.x * depth * 14;
  const py = mouse.y * depth * 14;

  return (
    <div
      className="absolute"
      style={{
        left: cfg.x, top: cfg.y, width: cfg.w, height: cfg.h,
        opacity: show ? cfg.opacity : 0,
        filter: `blur(${cfg.blur}px)`,
        transform: `rotate(${cfg.rot}deg) translate(${px}px,${py}px)`,
        transition: `opacity 0.8s ease-out ${cfg.delay + 0.1}s, transform 0.15s ease-out`,
      }}
    >
      <div
        style={{
          width: '100%', height: '100%',
          animation: `drift-${cfg.drift} ${18 + idx * 1.5}s ease-in-out infinite`,
          animationDelay: `${-idx * 2.3}s`,
        }}
      >
        <div
          className="h-full w-full overflow-hidden rounded-lg"
          style={{
            background: `linear-gradient(135deg,${pal[0]},${pal[1]},${pal[2]})`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          }}
        >
          <div className="flex h-full w-full flex-col justify-end p-3">
            <div className="mb-1.5 rounded-sm" style={{ width: '65%', height: 6, backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <div className="rounded-sm" style={{ width: '40%', height: 4, backgroundColor: 'rgba(255,255,255,0.08)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
