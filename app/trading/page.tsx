'use client';

/**
 * Manna Trading App (moved from root page)
 * Full experience available at /trading
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useStore } from '@/store/useStore';
import PriceTicker from '@/components/PriceTicker';
import { SiteHeader } from '@/components/SiteHeader';

// Dynamic imports for code splitting
const NOF1Dashboard = dynamic(() => import('@/components/NOF1Dashboard'), { ssr: false });
const AgentsSystem = dynamic(() => import('@/components/AgentsSystem'), { ssr: false });
const CoinAnalyzer = dynamic(() => import('@/components/CoinAnalyzer'), { ssr: false });
const UltimateQuantDashboard = dynamic(() => import('@/components/UltimateQuantDashboard'), { ssr: false });
const AnalyticsEmbed = dynamic(
  () => import('@/components/AnalyticsPanel').then((m) => {
    const Embed = () => <m.default embedded />;
    Embed.displayName = 'AnalyticsEmbed';
    return Embed;
  }),
  { ssr: false }
);

type ViewType = 'dashboard' | 'system' | 'analyze' | 'quant' | 'analytics';

export default function TradingHome() {
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [mounted, setMounted] = useState(false);
  
  // Shared state from store
  const accountValue = useStore((state) => state.accountValue);
  const positions = useStore((state) => state.positions);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-[#00ff88] rounded-full mx-auto mb-4" />
          <p className="text-[#666] text-sm">Initializing Trading System...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen bg-black flex flex-col overflow-hidden">
        {/* Shared Header */}
        <SiteHeader
          active="trading"
          accountValue={accountValue}
          positionCount={positions.length}
          showBadges
        />
        
        {/* Simulation Notice */}
        <div className="px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
          <span className="text-[11px] font-medium text-yellow-400 tracking-wide">SIMULATION MODE — real market data, no real funds at risk</span>
        </div>
        
        {/* Price Ticker */}
        <PriceTicker />
        
        {/* View Tabs */}
        <div className="flex items-center gap-1 px-4 py-1.5 bg-[#0a0a0a] border-b border-white/[0.06]">
          {([
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'system', label: 'Agents' },
            { key: 'analyze', label: 'Analyze' },
            { key: 'quant', label: 'Quant' },
            { key: 'analytics', label: 'Analytics' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`px-3 py-1 text-[11px] font-medium rounded transition-all ${
                activeView === tab.key
                  ? 'text-black bg-white'
                  : 'text-[#888] hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Main Content Area */}
        <main className="flex-1 min-h-0">
          <AnimatePresence mode="wait">
            {activeView === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <ErrorBoundary>
                  <NOF1Dashboard />
                </ErrorBoundary>
              </motion.div>
            )}
            
            {activeView === 'system' && (
              <motion.div
                key="system"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <ErrorBoundary>
                  <AgentsSystem />
                </ErrorBoundary>
              </motion.div>
            )}
            
            {activeView === 'analyze' && (
              <motion.div
                key="analyze"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <ErrorBoundary>
                  <CoinAnalyzer />
                </ErrorBoundary>
              </motion.div>
            )}
            
            {activeView === 'quant' && (
              <motion.div
                key="quant"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <ErrorBoundary>
                  <UltimateQuantDashboard />
                </ErrorBoundary>
              </motion.div>
            )}

            {activeView === 'analytics' && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="h-full overflow-auto"
              >
                <ErrorBoundary>
                  <AnalyticsEmbed />
                </ErrorBoundary>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        
        {/* Global Status Bar */}
        <StatusBar 
          accountValue={accountValue} 
          positionCount={positions.length}
        />
      </div>
    </ErrorBoundary>
  );
}

/**
 * Global Status Bar
 * Minimal footer with branding
 */
function StatusBar({ accountValue, positionCount }: { accountValue: number; positionCount: number }) {
  return (
    <div className="h-6 px-4 flex items-center justify-center bg-[#0a0a0a] border-t border-white/[0.05] text-[10px]">
      <div className="text-[#444]">
        Manna Trading | Simulation
      </div>
    </div>
  );
}



