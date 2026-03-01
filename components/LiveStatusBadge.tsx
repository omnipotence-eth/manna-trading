'use client';

import { useMemo } from 'react';
import useStore from '@/store/useStore';

const STALE_MS = 15000;

export default function LiveStatusBadge({ compact = false }: { compact?: boolean }) {
  const accountLastUpdated = useStore((s) => s.accountLastUpdated);

  const { label, timeAgo, isStale } = useMemo(() => {
    if (!accountLastUpdated) {
      return { label: 'No updates yet', timeAgo: '—', isStale: true };
    }
    const delta = Date.now() - accountLastUpdated;
    const stale = delta > STALE_MS;
    const secs = Math.floor(delta / 1000);
    let ago = '';
    if (secs < 10) ago = 'just now';
    else if (secs < 60) ago = `${secs}s ago`;
    else {
      const m = Math.floor(secs / 60);
      if (m < 60) ago = `${m}m ago`;
      else {
        const h = Math.floor(m / 60);
        ago = `${h}h ago`;
      }
    }
    return { label: stale ? 'Stale' : 'Live', timeAgo: ago, isStale: stale };
  }, [accountLastUpdated]);

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${compact ? 'text-[11px]' : 'text-sm'} border-white/10 bg-white/5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isStale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      <span className="text-white/80">{label}</span>
      <span className="text-white/50">· {timeAgo}</span>
    </div>
  );
}

