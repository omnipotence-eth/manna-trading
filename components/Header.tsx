'use client';

import { useState, useEffect } from 'react';

interface HeaderProps {
  activeView: 'live' | 'models';
  setActiveView: (view: 'live' | 'models') => void;
}

export default function Header({ activeView, setActiveView }: HeaderProps) {
  // Initialize with null to avoid hydration mismatch
  const [time, setTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-white/[0.08] bg-[#0a0a0a] shrink-0">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="status-dot" />
          <span className="text-[15px] font-semibold tracking-tight text-white">Manna</span>
        </div>
        <div className="h-4 w-px bg-white/[0.08]" />
        <span className="text-xs text-[#888]">Trading System</span>
      </div>

      {/* Center: Time */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <span className="text-mono text-[13px] text-[#666] tabular">
          {mounted && time ? time.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
        </span>
      </div>

      {/* Right: Navigation */}
      <nav className="flex items-center gap-1">
        {[
          { id: 'live' as const, label: 'Dashboard' },
          { id: 'models' as const, label: 'System' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-all ${
              activeView === item.id
                ? 'text-white bg-[#1a1a1a]'
                : 'text-[#666] hover:text-[#888] hover:bg-[#111]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
