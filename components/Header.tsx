'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface HeaderProps {
  activeView: 'live' | 'models';
  setActiveView: (view: 'live' | 'models') => void;
}

export default function Header({ activeView, setActiveView }: HeaderProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [scanStatus, setScanStatus] = useState<{ isScanning: boolean; lastScan: number }>({
    isScanning: false,
    lastScan: Date.now()
  });

  // Simple online status check
  useEffect(() => {
    const checkOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    checkOnlineStatus();
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);

    return () => {
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
    };
  }, []);

  // Scan status check
  useEffect(() => {
    const checkScanStatus = async () => {
      try {
        const response = await fetch('/api/multi-agent?action=workflows');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data && data.data.length > 0) {
            const latestWorkflow = data.data[0];
            setScanStatus({
              isScanning: latestWorkflow.status === 'running',
              lastScan: latestWorkflow.startedAt || Date.now()
            });
          }
        }
      } catch (error) {
        // Silent fail
      }
    };

    checkScanStatus();
    const interval = setInterval(checkScanStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <header className="border-b border-green-400/30 bg-black/90 backdrop-blur-sm sticky top-0 z-50 relative overflow-hidden">
      {/* Futuristic Background Effects */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        {/* Scanning Lines */}
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-400/60 to-transparent animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-400/60 to-transparent animate-pulse" style={{animationDelay: '1.5s'}}></div>
        
        {/* Data Stream Indicators */}
        <div className="absolute top-2 right-2 flex gap-1">
          <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
          <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
          <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '1s'}}></div>
        </div>
      </div>
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
        <div className="flex flex-col items-center gap-4">
          {/* Centered MANNA AI */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 sm:gap-3"
          >
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-500'} animate-pulse shadow-lg ${isOnline ? 'shadow-green-400/50' : 'shadow-red-500/50'}`}></div>
            <h1 className="text-xl sm:text-2xl font-bold">
              <span className="text-green-400">MANNA ARENA</span>
              <span className="text-neon-blue ml-2">AI</span>
            </h1>
            {scanStatus.isScanning ? (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex items-center gap-1.5 px-2 py-0.5 sm:px-3 sm:py-1 bg-green-500/20 border border-green-500/50 rounded text-xs"
              >
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-500 font-bold hidden sm:inline">SCANNING</span>
              </motion.div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-0.5 sm:px-3 sm:py-1 bg-blue-500/20 border border-blue-500/50 rounded text-[10px] sm:text-xs">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                <span className="text-blue-500/70">{getTimeAgo(scanStatus.lastScan)}</span>
              </div>
            )}
          </motion.div>

          {/* Centered Navigation */}
          <nav className="flex gap-1 sm:gap-2">
            {[
              { id: 'live' as const, label: 'LIVE' },
              { id: 'models' as const, label: 'AGENTS' },
            ].map((item) => (
              <motion.button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`px-3 sm:px-6 py-2 border transition-all text-xs sm:text-base ${
                  activeView === item.id
                    ? 'border-green-400 bg-green-400/10 text-green-400'
                    : 'border-green-400/30 text-green-400/60 hover:border-green-400/60'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {item.label}
              </motion.button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

