'use client';

import Link from 'next/link';
import AnalyticsPanel from '@/components/AnalyticsPanel';

/**
 * Analytics page – real trade data, simulation stats, export
 */
export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10 shrink-0">
        <Link
          href="/trading"
          className="text-sm text-[#888] hover:text-white transition-colors"
        >
          ← Back to Trading
        </Link>
        <h1 className="text-lg font-semibold">Analytics & Export</h1>
      </div>
      <div className="flex-1 min-h-0">
        <AnalyticsPanel embedded={false} />
      </div>
    </div>
  );
}
