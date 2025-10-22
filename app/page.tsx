'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import PriceTicker from '@/components/PriceTicker';
import Dashboard from '@/components/Dashboard';
import Leaderboard from '@/components/Leaderboard';
import Models from '@/components/Models';
import ErrorBoundary from '@/components/ErrorBoundary';
import DebugPanel from '@/components/DebugPanel';

export default function Home() {
  const [activeView, setActiveView] = useState<'live' | 'leaderboard' | 'models'>('live');

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-black text-green-500">
        <Header activeView={activeView} setActiveView={setActiveView} />
        <PriceTicker />
        
        <div className="container mx-auto px-4 py-8">
          <ErrorBoundary>
            {activeView === 'live' && <Dashboard />}
          </ErrorBoundary>
          <ErrorBoundary>
            {activeView === 'leaderboard' && <Leaderboard />}
          </ErrorBoundary>
          <ErrorBoundary>
            {activeView === 'models' && <Models />}
          </ErrorBoundary>
        </div>
        
        {/* Background effects */}
        <div className="fixed inset-0 pointer-events-none opacity-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-green rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-blue rounded-full blur-3xl"></div>
        </div>

        {/* Debug panel - only shows in development */}
        <DebugPanel />
      </main>
    </ErrorBoundary>
  );
}

