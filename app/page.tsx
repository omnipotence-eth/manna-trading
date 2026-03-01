'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { motion } from 'framer-motion';

const LiveBalanceChart = dynamic(() => import('@/components/LiveBalanceChart'), { ssr: false });
const SiteHeader = dynamic(() => import('@/components/SiteHeader').then(m => m.SiteHeader), { ssr: false });

const TECH_STACK = [
  'Next.js 14',
  'TypeScript',
  'DeepSeek R1',
  'PostgreSQL',
  'WebSocket',
  'Zustand',
  'Tailwind CSS',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-000)] text-[var(--text-100)]">
      <SiteHeader active="portfolio" showBadges={false} />

      <div className="mx-auto flex max-w-5xl flex-col items-center gap-14 px-6 py-16 sm:py-24 text-center">
        {/* Hero */}
        <div className="space-y-5 max-w-2xl">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-semibold leading-[1.08] tracking-tight">
            Manna
          </h1>
          <p className="text-lg sm:text-xl text-[var(--text-300)] leading-relaxed max-w-xl mx-auto">
            Autonomous crypto trading powered by a multi-agent AI pipeline, real-time market data, and mathematical risk management.
          </p>
        </div>

        {/* Cards */}
        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-3xl items-stretch">
          <Card
            title="Live Dashboard"
            copy="Real-time positions, P&L tracking, AI agent activity, and market data — all running in simulation mode."
            href="/trading"
            label="Launch"
            showChart
            isPrimary
          />
          <Card
            title="Analytics & Export"
            copy="Export trades as CSV/JSON, view simulation stats and trade history (real data from DB)."
            href="/trading/analytics"
            label="Open"
          />
          <FlipCard
            title="Whitepaper"
            copy="Architecture, risk philosophy, agent design, data flows, and execution controls that power Manna."
            href="/whitepaper"
            label="Read"
          />
        </div>

        {/* Tech Stack */}
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-[var(--text-400)] font-medium">
            Built with
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {TECH_STACK.map((tech) => (
              <span
                key={tech}
                className="px-3 py-1 text-xs font-mono rounded-full border border-[var(--border-200)] text-[var(--text-300)] bg-[var(--bg-100)]"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Source / Contact */}
        <div className="flex gap-6 text-sm text-[var(--text-400)]">
          <a
            href="https://github.com/omnipotence-eth/manna-trading"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--accent)] transition-colors"
          >
            GitHub
          </a>
          <span className="text-[var(--border-200)]">|</span>
          <a
            href="mailto:contact@omnipotence.art"
            className="hover:text-[var(--accent)] transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </div>
  );
}


function Card({
  title,
  copy,
  href,
  label,
  external,
  showChart,
  isPrimary
}: {
  title: string;
  copy: string;
  href?: string;
  label?: string;
  external?: boolean;
  showChart?: boolean;
  isPrimary?: boolean;
}) {
  return (
    <Link
      href={href || '#'}
      prefetch={false}
      target={external ? '_blank' : undefined}
      className={`group flex-1 rounded-2xl border bg-[var(--bg-100)] p-6 space-y-4 text-left transition-all duration-200 block ${
        isPrimary 
          ? 'border-[var(--border-200)] hover:border-[var(--accent)]/30 hover:bg-[var(--bg-200)] hover:shadow-[0_0_20px_rgba(0,255,136,0.1)]' 
          : 'border-[var(--border-200)] hover:border-[var(--border-300)] hover:bg-[var(--bg-200)]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-[var(--text-100)]">
          {title}
        </h3>
        {label && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] opacity-70 group-hover:opacity-100 group-hover:gap-2 transition-all">
            {label}
            <span className="text-[var(--accent)]">→</span>
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--text-300)] leading-relaxed mb-4">{copy}</p>
      {showChart && (
        <div className="rounded-lg border border-[var(--border-200)] bg-[var(--bg-000)] overflow-hidden -mx-2">
          <div className="h-48 min-h-[12rem]">
            <LiveBalanceChart compact initialBalance={1000} />
          </div>
        </div>
      )}
    </Link>
  );
}

function FlipCard({
  title,
  copy,
  href,
  label
}: {
  title: string;
  copy: string;
  href?: string;
  label?: string;
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="flex-1 perspective-1000"
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
    >
      <motion.div
        className="relative w-full h-full preserve-3d"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0.0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front */}
        <div className="absolute inset-0 backface-hidden">
          <div className="group rounded-2xl border border-[var(--border-200)] bg-[var(--bg-100)] p-6 space-y-4 text-left transition-all duration-200 hover:border-[var(--border-300)] hover:bg-[var(--bg-200)] h-full flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-[var(--text-100)]">
                {title}
              </div>
              {href && label && (
                <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all">
                  {label}
                  <span className="text-[var(--accent)]">→</span>
                </div>
              )}
            </div>
            <p className="text-sm text-[var(--text-300)] leading-relaxed flex-1">{copy}</p>
            <div className="text-xs text-[var(--text-400)] italic">
              Hover to flip →
            </div>
          </div>
        </div>

        {/* Back */}
        <div 
          className="absolute inset-0 backface-hidden"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <Link
            href={href || '#'}
            prefetch={false}
            className="block h-full"
          >
            <div className="group rounded-2xl border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--bg-100)] to-[var(--bg-200)] p-6 space-y-4 text-left transition-all duration-200 hover:border-[var(--accent)]/50 hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] h-full flex flex-col">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-[var(--accent)]">
                  {title}
                </div>
                {href && label && (
                  <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)]">
                    {label}
                    <span className="text-[var(--accent)]">→</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-3">
                <p className="text-sm text-[var(--text-200)] leading-relaxed font-medium">
                  Explore the technical documentation:
                </p>
                <ul className="text-xs text-[var(--text-300)] space-y-2 list-disc list-inside">
                  <li>Multi-Agent AI Architecture</li>
                  <li>Risk Management Philosophy</li>
                  <li>Data Flow & Execution Pipeline</li>
                  <li>Machine Learning Integration</li>
                  <li>Security & Reliability</li>
                </ul>
              </div>
              <div className="text-xs text-[var(--accent)] font-medium">
                Click to read full whitepaper →
              </div>
            </div>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
