'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import PriceTicker from '@/components/PriceTicker';
import EnhancedDashboard from '@/components/EnhancedDashboard';
import TradeJournal from '@/components/TradeJournal';
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
          
          <div className="container mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
            <ErrorBoundary>
              {activeView === 'live' && <EnhancedDashboard />}
            </ErrorBoundary>
            <ErrorBoundary>
              {activeView === 'leaderboard' && <TradeJournal />}
            </ErrorBoundary>
            <ErrorBoundary>
              {activeView === 'models' && <Models />}
            </ErrorBoundary>
          </div>
          
          {/* Background effects */}
          <div className="fixed inset-0 pointer-events-none opacity-10">
            <div className="absolute top-1/4 left-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-neon-green rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-neon-blue rounded-full blur-3xl"></div>
          </div>

          {/* Debug panel - only shows in development */}
          <DebugPanel />
        </main>
      </ErrorBoundary>
  );
}

