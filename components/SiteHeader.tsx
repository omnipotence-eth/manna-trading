'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type HeaderProps = {
  active: 'portfolio' | 'trading';
  accountValue?: number;
  positionCount?: number;
  showBadges?: boolean;
};

export function SiteHeader({
  active,
  accountValue,
  positionCount,
  showBadges = true
}: HeaderProps) {
  const [time, setTime] = useState<string>('--:--:--');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const navLink = (href: string, label: string, isActive: boolean) => (
    <Link
      href={href}
      prefetch={false}
      className={`px-3 sm:px-4 py-1.5 text-[12px] font-medium rounded-md transition-all ${
        isActive ? 'text-black bg-white' : 'text-[#888] hover:text-white hover:bg-white/5'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="h-auto md:h-14 flex items-center justify-between gap-3 flex-wrap md:flex-nowrap px-3 sm:px-4 py-2 border-b border-white/[0.08] bg-[#0a0a0a] shrink-0">
      {/* Left: brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse" />
          <span className="text-[15px] font-semibold tracking-tight text-white">Manna</span>
        </div>
        <div className="h-4 w-px bg-white/[0.08]" />
        <span className="text-xs text-[#666]">v7.0</span>
      </div>

      {/* Center: nav */}
      <nav className="w-full md:w-auto flex justify-center md:justify-start md:absolute md:left-1/2 md:-translate-x-1/2 items-center gap-1 bg-[#111] rounded-lg p-1">
        {navLink('/', 'Portfolio', active === 'portfolio')}
        {navLink('/trading', 'Trading', active === 'trading')}
      </nav>

      {/* Right: stats / badges */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-end">
        {typeof accountValue === 'number' && (
          <div className="text-right">
            <div className="text-[13px] font-medium text-white tabular">${accountValue.toFixed(2)}</div>
            <div className="text-[10px] text-[#666]">
              {positionCount ?? 0} position{positionCount !== 1 ? 's' : ''}
            </div>
          </div>
        )}
        <div className="h-6 w-px bg-white/[0.08] hidden sm:block" />
        <span className="text-mono text-[12px] text-[#555] tabular w-16 text-center hidden sm:inline">
          {time}
        </span>
      </div>
    </header>
  );
}

