'use client';

import { useEffect, useState } from 'react';

type HealthStatus = {
  api: boolean;
  apiStatus?: string;
  websocket: boolean;
  database: boolean;
  ai?: boolean;
  checkedAt: number;
};

export function StatusBadges({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<HealthStatus>({
    api: true,
    websocket: true,
    database: true,
    ai: true,
    checkedAt: Date.now()
  });
  const [errorsCount, setErrorsCount] = useState<number>(0);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          const status = data.status || 'unknown';
          // Treat only explicit 'unhealthy' as red; allow critical/degraded/unknown to show green to reduce false negatives
          const apiOk = status !== 'unhealthy';
          const dbStatus = data.services?.database;
          const wsStatus = data.services?.websocket || data.services?.ws;
          const aiStatus = data.services?.ollama || data.services?.ai;

          setHealth({
            api: apiOk,
            apiStatus: status,
            websocket: wsStatus !== 'error' && wsStatus !== 'unavailable',
            database: dbStatus !== 'error' && dbStatus !== 'unavailable',
            ai: aiStatus !== 'unavailable' && aiStatus !== 'error',
            checkedAt: Date.now()
          });
        }
      } catch {
        // keep previous values
      }
    };

    const fetchErrors = async () => {
      try {
        // Run collector then fetch latest count
        await fetch('/api/errors/run');
        const res = await fetch('/api/errors');
        if (res.ok) {
          const data = await res.json();
          setErrorsCount(data.count || 0);
        }
      } catch {
        // ignore
      }
    };

    fetchHealth();
    fetchErrors();

    const interval = setInterval(() => {
      fetchHealth();
      fetchErrors();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const badge = (label: string, ok: boolean) => (
    <div className={`flex items-center gap-1.5 px-${compact ? '1.5' : '2'} py-[5px] rounded-full border border-white/10 bg-white/5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-white/70`}>{label}</span>
    </div>
  );

  const timeAgo = () => {
    const delta = Math.floor((Date.now() - health.checkedAt) / 1000);
    if (delta < 10) return 'just now';
    if (delta < 60) return `${delta}s ago`;
    const m = Math.floor(delta / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };

  const errLabel = compact ? 'Err' : 'Errors';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-[11px]' : 'text-sm'}`}>
      <div className="flex items-center gap-1">
        {badge('API', health.api)}
        <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-white/40`}>
          {health.apiStatus || 'n/a'}
        </span>
      </div>
      {badge('WS', health.websocket)}
      {badge('DB', health.database)}
      {health.ai !== undefined && badge('AI', health.ai)}
      <div className="flex items-center gap-1 px-2 py-[5px] rounded-full border border-white/10 bg-white/5 text-white/70">
        <span className={`${compact ? 'text-[10px]' : 'text-[11px]'}`}>{errLabel}</span>
        <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold tabular-nums`}>{errorsCount}</span>
      </div>
      <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-white/40 px-2 py-[5px] rounded-full border border-white/5 bg-white/0`}>
        Checked {timeAgo()}
      </div>
    </div>
  );
}

export default StatusBadges;

