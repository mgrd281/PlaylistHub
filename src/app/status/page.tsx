'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import FloatingPostersLayout from '@/components/floating-posters';

export default function StatusPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <FloatingPostersLayout>
      <div className="flex min-h-screen items-center justify-center px-4">
        <div
          className="flex flex-col items-center transition-all duration-1000 ease-out"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
          }}
        >
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

          <div className="flex w-[380px] flex-col items-center rounded-2xl border border-black/[0.06] bg-white/70 px-10 py-10 shadow-[0_8px_60px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            <div className="relative mb-6">
              <svg width="80" height="80" viewBox="0 0 80 80" className="rotate-[-90deg]">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#e8e6e1" strokeWidth="4" />
                <circle
                  cx="40" cy="40" r="34"
                  fill="none" stroke="#1a1a1a" strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={mounted ? `${2 * Math.PI * 34 * 0.28}` : `${2 * Math.PI * 34}`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tracking-tight text-[#1a1a1a]">
                72%
              </span>
            </div>

            <h1 className="mb-2 text-center text-xl font-semibold tracking-tight text-[#1a1a1a]">
              Setting things up
            </h1>
            <p className="mb-6 max-w-[280px] text-center text-[13px] leading-relaxed text-[#7a7870]">
              We&apos;re preparing your media library. This usually takes just a moment.
            </p>

            <div className="flex gap-1.5">
              <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-[#1a1a1a]/40" />
              <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_0.2s_infinite] rounded-full bg-[#1a1a1a]/40" />
              <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_0.4s_infinite] rounded-full bg-[#1a1a1a]/40" />
            </div>
          </div>

          <p className="mt-6 text-[12px] tracking-wide text-[#b0ada5]">
            We&apos;ll notify you when everything is ready.
          </p>
        </div>
      </div>
    </FloatingPostersLayout>
  );
}
