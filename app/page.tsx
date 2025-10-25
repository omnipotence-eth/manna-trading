'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import PriceTicker from '@/components/PriceTicker';
import NOF1Dashboard from '@/components/NOF1Dashboard';
import Models from '@/components/Models';
import ErrorBoundary from '@/components/ErrorBoundary';
export default function Home() {
  const [activeView, setActiveView] = useState<'live' | 'models'>('live');

  return (
    <ErrorBoundary>
      <main className="h-screen bg-black text-green-500 overflow-hidden flex flex-col">
          <Header activeView={activeView} setActiveView={setActiveView} />
          <PriceTicker />
          
          {/* Live Dashboard - Full Width */}
          {activeView === 'live' && (
            <div className="flex-1 min-h-0">
              <ErrorBoundary>
                <NOF1Dashboard />
              </ErrorBoundary>
            </div>
          )}
          
          {/* GODSPEED view */}
          {activeView === 'models' && (
            <div className="container mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 flex-1 overflow-auto">
              <ErrorBoundary>
                <Models />
              </ErrorBoundary>
            </div>
          )}
          
          {/* Background effects */}
          <div className="fixed inset-0 pointer-events-none opacity-10 z-0">
            <div className="absolute top-1/4 left-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-neon-green rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-neon-blue rounded-full blur-3xl"></div>
          </div>
              </main>
            </ErrorBoundary>
  );
}

