import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PlaylistHub TV',
  description: 'Fire TV experience for PlaylistHub',
};

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {children}
    </div>
  );
}
