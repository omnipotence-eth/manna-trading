'use client';

import { motion } from 'framer-motion';

interface HeaderProps {
  activeView: 'live' | 'models';
  setActiveView: (view: 'live' | 'models') => void;
}

export default function Header({ activeView, setActiveView }: HeaderProps) {
  return (
    <header className="border-b border-green-500/30 bg-black/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse shadow-lg shadow-neon-green/50"></div>
              <h1 className="text-xl sm:text-2xl font-bold">
                <span className="text-neon-green">MANNA ARENA</span>
                <span className="text-neon-blue ml-2">AI</span>
              </h1>
            </div>
          </motion.div>

          <nav className="flex gap-1 sm:gap-2">
            {[
              { id: 'live' as const, label: 'LIVE' },
              { id: 'models' as const, label: 'GODSPEED' },
            ].map((item) => (
              <motion.button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`px-3 sm:px-6 py-2 border transition-all text-xs sm:text-base ${
                  activeView === item.id
                    ? 'border-green-500 bg-green-500/10 text-green-500'
                    : 'border-green-500/30 text-green-500/60 hover:border-green-500/60'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {item.label}
              </motion.button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <motion.button
              className="px-6 py-2 border border-neon-blue text-neon-blue hover:bg-neon-blue/10 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              JOIN WAITLIST
            </motion.button>
          </div>
        </div>
      </div>
    </header>
  );
}

