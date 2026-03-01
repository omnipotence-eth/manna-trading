'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ReadyState {
  ready: boolean;
  timestamp: string;
  missing: string[];
  warnings: string[];
  checks: { aster: boolean; llm: boolean; database: boolean };
}

interface HealthState {
  success?: boolean;
  data?: {
    status: string;
    timestamp: string;
    services?: Record<string, string>;
    config?: { hasApiKey: boolean; hasSecretKey: boolean };
  };
}

export default function StatusPage() {
  const [ready, setReady] = useState<ReadyState | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const [readyRes, healthRes] = await Promise.all([
          fetch('/api/health/ready', { cache: 'no-store' }),
          fetch('/api/health', { cache: 'no-store' }),
        ]);
        if (cancelled) return;
        const readyData = await readyRes.json();
        const healthData = await healthRes.json();
        setReady(readyData);
        setHealth(healthData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-green-400 rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">Failed to load status: {error}</p>
          <Link href="/" className="text-green-400 hover:underline">Back to home</Link>
        </div>
      </div>
    );
  }

  const isReady = ready?.ready ?? false;
  const missing = ready?.missing ?? [];
  const warnings = ready?.warnings ?? [];
  const checks = ready?.checks ?? { aster: false, llm: false, database: false };
  const status = health?.data?.status ?? 'unknown';

  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">System Status</h1>
        <Link href="/" className="text-sm text-gray-400 hover:text-white">Home</Link>
      </div>

      <div className="space-y-6">
        <section className="rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Readiness</h2>
          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full ${
                isReady ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className={isReady ? 'text-green-400' : 'text-red-400'}>
              {isReady ? 'Ready' : 'Not ready'}
            </span>
          </div>
          {ready?.timestamp && (
            <p className="text-xs text-gray-500 mt-2">{new Date(ready.timestamp).toLocaleString()}</p>
          )}
        </section>

        <section className="rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Checks</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className={checks.aster ? 'text-green-400' : 'text-red-400'}>{checks.aster ? '✓' : '✗'}</span>
              Aster API keys
            </li>
            <li className="flex items-center gap-2">
              <span className={checks.llm ? 'text-green-400' : 'text-amber-400'}>{checks.llm ? '✓' : '○'}</span>
              LLM (Groq/Ollama)
            </li>
            <li className="flex items-center gap-2">
              <span className={checks.database ? 'text-green-400' : 'text-gray-500'}>{checks.database ? '✓' : '—'}</span>
              Database
            </li>
          </ul>
        </section>

        {missing.length > 0 && (
          <section className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <h2 className="text-sm font-medium text-red-400 uppercase tracking-wider mb-2">Missing</h2>
            <ul className="list-disc list-inside text-sm text-red-300 space-y-1">
              {missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </section>
        )}

        {warnings.length > 0 && (
          <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <h2 className="text-sm font-medium text-amber-400 uppercase tracking-wider mb-2">Warnings</h2>
            <ul className="list-disc list-inside text-sm text-amber-300 space-y-1">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Overall health</h2>
          <p className="text-sm capitalize">{status}</p>
        </section>

        <section className="text-sm text-gray-500 space-y-1">
          <p>
            <a href="/api/health/ready" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">/api/health/ready</a>
            {' — readiness (env + critical services)'}
          </p>
          <p>
            <a href="/api/health" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">/api/health</a>
            {' — full health check'}
          </p>
          <p>
            <a href="/api/diagnostics/why-no-trades" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">/api/diagnostics/why-no-trades</a>
            {' — why no trades'}
          </p>
        </section>
      </div>
    </div>
  );
}
