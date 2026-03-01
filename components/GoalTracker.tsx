'use client';

/**
 * GOAL TRACKER COMPONENT
 * 
 * Visual progress tracker for trading goals
 * Shows: progress bar, milestones, strategy recommendations, and urgency
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { frontendLogger } from '@/lib/frontendLogger';
import { Target } from 'phosphor-react';

interface GoalData {
  goal: {
    id: string;
    name: string;
    startBalance: number;
    targetBalance: number;
    currentBalance: number;
    startTime: string;
    deadline: string;
    status: 'active' | 'achieved' | 'failed' | 'paused';
    milestones: { target: number; label: string; achieved: boolean; achievedAt?: string }[];
    tradeCount: number;
  } | null;
  progress: number;
  remainingGrowth: number;
  hoursRemaining: number;
  pnlToday: number;
  winRate: number;
  recommendation: {
    urgency: 'low' | 'medium' | 'high' | 'critical';
    positionSizeMultiplier: number;
    minConfidence: number;
    minRiskReward: number;
    maxConcurrentPositions: number;
    message: string;
    tactics: string[];
  };
}

export default function GoalTracker() {
  const [data, setData] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchGoal = async () => {
      try {
        const res = await fetch('/api/goal');
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setData(json.data);
          }
        }
      } catch (err) {
        frontendLogger.error('Goal fetch error', err instanceof Error ? err : new Error(String(err)), {
          component: 'GoalTracker',
          action: 'fetchGoal',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchGoal();
    const interval = setInterval(fetchGoal, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="h-4 w-4 bg-white/10 rounded-full" />
          <div className="h-4 w-32 bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  if (!data?.goal) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-4">
        <p className="text-sm text-[#666]">No active goal</p>
      </div>
    );
  }

  const { goal, progress, remainingGrowth, hoursRemaining, recommendation } = data;
  
  const urgencyColors = {
    low: 'text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/20',
    medium: 'text-[#ffaa00] bg-[#ffaa00]/10 border-[#ffaa00]/20',
    high: 'text-[#ff6600] bg-[#ff6600]/10 border-[#ff6600]/20',
    critical: 'text-[#ff3333] bg-[#ff3333]/10 border-[#ff3333]/20 animate-pulse',
  };

  const progressColor = progress >= 100 
    ? 'bg-[#00ff88]' 
    : progress >= 75 
    ? 'bg-[#00ff88]' 
    : progress >= 50 
    ? 'bg-[#ffaa00]' 
    : progress >= 25 
    ? 'bg-[#ff6600]' 
    : 'bg-[#ff3333]';

  return (
    <motion.div 
      className="rounded-xl border border-white/[0.08] bg-[#0a0a0a] overflow-hidden"
      layout
    >
      {/* Main Goal Display */}
      <div 
        className="p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={20} weight="fill" className="text-[#00ff88]" />
            <div>
              <div className="text-sm font-medium text-white">{goal.name}</div>
              <div className="text-[10px] text-[#666]">
                {hoursRemaining.toFixed(1)}h remaining
              </div>
            </div>
          </div>
          <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${urgencyColors[recommendation.urgency]}`}>
            {recommendation.urgency.toUpperCase()}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative h-3 bg-[#1a1a1a] rounded-full overflow-hidden mb-2">
          <motion.div 
            className={`absolute left-0 top-0 h-full ${progressColor} rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
          {/* Milestones */}
          {goal.milestones.map((m, i) => (
            <div 
              key={i}
              className={`absolute top-0 h-full w-0.5 ${m.achieved ? 'bg-[#00ff88]' : 'bg-white/20'}`}
              style={{ left: `${((m.target - goal.startBalance) / (goal.targetBalance - goal.startBalance)) * 100}%` }}
            />
          ))}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-[#666]">Current</div>
            <div className="text-sm font-medium text-white tabular">
              ${goal.currentBalance.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#666]">Target</div>
            <div className="text-sm font-medium text-[#00ff88] tabular">
              ${goal.targetBalance.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#666]">Need</div>
            <div className={`text-sm font-medium tabular ${remainingGrowth > 20 ? 'text-[#ff6600]' : 'text-white'}`}>
              +{remainingGrowth.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.05] overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Strategy Message */}
              <div className={`p-3 rounded-lg border ${urgencyColors[recommendation.urgency]} text-[11px]`}>
                {recommendation.message}
              </div>

              {/* Milestones */}
              <div>
                <div className="text-[11px] text-[#666] mb-2">Milestones</div>
                <div className="flex gap-2">
                  {goal.milestones.map((m, i) => (
                    <div 
                      key={i}
                      className={`flex-1 py-1.5 px-2 rounded text-center text-[10px] border ${
                        m.achieved 
                          ? 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]' 
                          : 'bg-white/5 border-white/10 text-[#666]'
                      }`}
                    >
                      <div className="font-medium">{m.label}</div>
                      <div className="opacity-70">${m.target.toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tactics */}
              <div>
                <div className="text-[11px] text-[#666] mb-2">Recommended Tactics</div>
                <div className="space-y-1">
                  {recommendation.tactics.map((tactic, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-[#888]">
                      <span className="text-[#00ff88]">→</span>
                      <span>{tactic}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trading Parameters */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/[0.05]">
                <div className="text-center">
                  <div className="text-[10px] text-[#555]">Size</div>
                  <div className="text-[11px] text-white font-medium">
                    {(recommendation.positionSizeMultiplier * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-[#555]">Min Conf</div>
                  <div className="text-[11px] text-white font-medium">
                    {(recommendation.minConfidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-[#555]">Min R:R</div>
                  <div className="text-[11px] text-white font-medium">
                    {recommendation.minRiskReward.toFixed(1)}:1
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-[#555]">Max Pos</div>
                  <div className="text-[11px] text-white font-medium">
                    {recommendation.maxConcurrentPositions}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

