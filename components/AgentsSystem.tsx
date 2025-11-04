/**
 * Agents System Tab - Full Multi-Agent Trading System Information
 * Shows all 4 agents, their roles, and real-time status
 */

'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface Agent {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  description: string;
  responsibilities: string[];
  status: 'active' | 'idle' | 'working';
}

export default function AgentsSystem() {
  const [agents] = useState<Agent[]>([
    {
      id: 'technical',
      name: 'Technical Analyst',
      role: 'Chart Pattern Recognition & Technical Indicators',
      icon: '📊',
      color: 'text-blue-400',
      description: 'Analyzes price action, volume, momentum, and technical indicators using DeepSeek R1 Chain-of-Thought reasoning',
      responsibilities: [
        'RSI & momentum analysis (extremes, divergences)',
        'Volume microstructure (10min, 1h, 4h, 24h)',
        'Support/resistance levels via order book',
        'MA positioning (20/50/200 period)',
        'Volatility patterns (True Range)',
        'Pattern recognition (breakouts, reversals, consolidation)'
      ],
      status: 'active'
    },
    {
      id: 'risk',
      name: 'Risk Manager',
      role: 'Position Sizing & Risk Assessment',
      icon: '🛡️',
      color: 'text-orange-400',
      description: 'Uses Kelly Criterion and ATR-based stops to protect capital and optimize position sizing',
      responsibilities: [
        'Kelly Criterion position sizing (30% fractional)',
        'Confidence-adjusted allocation (5-20% per trade)',
        'ATR-based dynamic stop-loss',
        'Risk/reward validation (min 2:1)',
        'Leverage management (max 2x)',
        'Balance verification before trades',
        'Real-time position monitoring'
      ],
      status: 'active'
    },
    {
      id: 'chief',
      name: 'Chief Analyst',
      role: 'Final Decision Authority & Multi-Factor Integration',
      icon: '🧠',
      color: 'text-purple-400',
      description: 'Synthesizes all agent inputs with market regime awareness to make final trading decisions',
      responsibilities: [
        'Multi-agent consensus building',
        'Market regime detection (trend/ranging/volatile)',
        'Calibrated confidence scoring',
        'Probabilistic win rate calculation',
        'Historical pattern matching',
        'Execution timing optimization',
        'Final BUY/SELL/HOLD decision'
      ],
      status: 'active'
    },
    {
      id: 'execution',
      name: 'Execution Specialist',
      role: 'Trade Execution & Order Management',
      icon: '⚡',
      color: 'text-green-400',
      description: 'Executes approved trades with retry logic and monitors position lifecycle',
      responsibilities: [
        'Order placement with 3 retry attempts',
        'Exponential backoff (2s, 4s, 8s)',
        'Position monitor registration',
        'Stop-loss/take-profit setup',
        'Trailing stop management',
        'Trade logging & database persistence',
        'Failure handling & error recovery'
      ],
      status: 'active'
    }
  ]);

  const [systemStats, setSystemStats] = useState({
    totalWorkflows: 0,
    completedWorkflows: 0,
    failedWorkflows: 0,
    averageWorkflowTime: 0
  });

  const trades = useStore((state) => state.trades);
  const positions = useStore((state) => state.positions);
  const accountValue = useStore((state) => state.accountValue);

  // Fetch real system stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/multi-agent?action=workflows');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const workflows = data.data;
            setSystemStats({
              totalWorkflows: workflows.length,
              completedWorkflows: workflows.filter((w: any) => w.status === 'completed').length,
              failedWorkflows: workflows.filter((w: any) => w.status === 'failed').length,
              averageWorkflowTime: workflows.length > 0
                ? workflows.reduce((sum: number, w: any) => sum + (w.completedAt || Date.now()) - w.startedAt, 0) / workflows.length / 1000
                : 0
            });
          }
        }
      } catch (error) {
        // Use logger instead of console.error for consistency
        // logger.error('Failed to fetch system stats', error as Error, { context: 'AgentsSystem' });
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold terminal-text mb-2">MULTI-AGENT TRADING SYSTEM</h1>
        <p className="text-green-500/60 text-sm">
          4 Specialized AI Agents • 1 Market Scanner Service • DeepSeek R1 14B • GPU Accelerated • Chain-of-Thought Reasoning
        </p>
      </motion.div>

      {/* System Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect p-6 rounded-lg"
      >
        <h2 className="text-xl font-bold text-neon-green mb-4">System Overview</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{systemStats.totalWorkflows}</div>
            <div className="text-xs text-green-500/60">Total Workflows</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{systemStats.completedWorkflows}</div>
            <div className="text-xs text-green-500/60">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{systemStats.failedWorkflows}</div>
            <div className="text-xs text-green-500/60">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">{systemStats.averageWorkflowTime.toFixed(1)}s</div>
            <div className="text-xs text-green-500/60">Avg Time</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="flex justify-between">
            <span className="text-green-500/60">Account Value:</span>
            <span className="text-green-500 font-bold">${accountValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Open Positions:</span>
            <span className="text-green-500 font-bold">{positions.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Total Trades:</span>
            <span className="text-green-500 font-bold">{trades.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Scan Interval:</span>
            <span className="text-green-500 font-bold">Every 2 minutes</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Base Confidence:</span>
            <span className="text-green-500 font-bold">25% (RL-adapted)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">RL Optimizer:</span>
            <span className="text-purple-400 font-bold">ACTIVE (30-35%)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Max Leverage:</span>
            <span className="text-green-500 font-bold">1x (accounts &lt;$500)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Rate Limit:</span>
            <span className="text-green-500 font-bold">1 RPS/key (30 total)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Market Scanner:</span>
            <span className="text-green-500 font-bold">Top 50, batch 5/5s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Order Book:</span>
            <span className="text-yellow-500 font-bold">OFF (stability)</span>
          </div>
        </div>
      </motion.div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map((agent, index) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-effect p-6 rounded-lg hover:border-green-500/60 transition-all"
          >
            {/* Agent Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{agent.icon}</span>
                <div>
                  <h3 className={`text-lg font-bold ${agent.color}`}>{agent.name}</h3>
                  <p className="text-xs text-green-500/60">{agent.role}</p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs border ${
                agent.status === 'active' ? 'border-green-500 text-green-500' :
                agent.status === 'working' ? 'border-yellow-500 text-yellow-500' :
                'border-gray-500 text-gray-500'
              }`}>
                {agent.status.toUpperCase()}
              </span>
            </div>

            {/* Agent Description */}
            <p className="text-sm text-green-500/80 mb-4">{agent.description}</p>

            {/* Agent Responsibilities */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-green-500/60 uppercase">Responsibilities:</div>
              <ul className="space-y-1">
                {agent.responsibilities.map((responsibility, i) => (
                  <li key={i} className="text-xs text-green-500/70 flex items-start gap-2">
                    <span className="text-green-500/40 shrink-0">•</span>
                    <span>{responsibility}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Trading Workflow */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-effect p-6 rounded-lg"
      >
        <h2 className="text-xl font-bold text-neon-green mb-4">Trading Workflow</h2>
        
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-blue-400 font-bold shrink-0">1. SCAN</span>
            <p className="text-green-500/80">Market Scanner Service (algorithmic, non-AI) analyzes <strong>top 50 symbols</strong> from Aster DEX every 2 minutes using batch processing (5 symbols per 5 seconds). Multi-factor scoring: Volume 30%, Momentum 25%, RSI 20%, Volatility 15%, Liquidity 10%. <span className="text-yellow-500/80">Order book analysis disabled for stability.</span></p>
          </div>
          
          <div className="flex items-start gap-3">
            <span className="text-blue-400 font-bold shrink-0">2. ANALYZE</span>
            <p className="text-green-500/80">Technical Analyst performs deep Chain-of-Thought analysis on top opportunities (score ≥70, confidence ≥35%) using DeepSeek R1 14B model</p>
          </div>
          
          <div className="flex items-start gap-3">
            <span className="text-purple-400 font-bold shrink-0">3. DECIDE</span>
            <p className="text-green-500/80">Chief Analyst synthesizes all inputs with market regime awareness, calculates calibrated confidence, and makes final BUY/SELL/HOLD decision</p>
          </div>
          
          <div className="flex items-start gap-3">
            <span className="text-orange-400 font-bold shrink-0">4. ASSESS</span>
            <p className="text-green-500/80">Risk Manager validates decision, calculates Kelly Criterion position size (5-20% of balance), sets ATR-based stop-loss, and approves/rejects trade</p>
          </div>
          
          <div className="flex items-start gap-3">
            <span className="text-green-400 font-bold shrink-0">5. EXECUTE</span>
            <p className="text-green-500/80">Execution Specialist places market order with 3 retry attempts, registers position with monitor for automatic stop-loss/take-profit/trailing stops</p>
          </div>
          
          <div className="flex items-start gap-3">
            <span className="text-cyan-400 font-bold shrink-0">6. MONITOR</span>
            <p className="text-green-500/80">Position Monitor tracks trade in real-time, auto-executes stop-loss/take-profit, applies trailing stops (2%), and handles position timeout protection</p>
          </div>
        </div>
      </motion.div>

      {/* RL Optimizer Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-effect p-6 rounded-lg border border-purple-500/30"
      >
        <h2 className="text-xl font-bold text-purple-400 mb-4">🤖 Reinforcement Learning Optimizer</h2>
        
        <div className="space-y-4 text-sm text-green-500/80">
          <p>
            Advanced RL system that <strong>learns from every trade</strong> and adapts parameters in real-time based on market conditions and performance.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-purple-300 font-bold mb-2">📊 Adapts To:</h3>
              <ul className="space-y-1 text-xs">
                <li>• <strong>Market Regime:</strong> Trending/Ranging/Volatile</li>
                <li>• <strong>Account Size:</strong> Micro/Small/Medium/Large</li>
                <li>• <strong>Performance:</strong> Win rate & volatility</li>
                <li>• <strong>Risk Profile:</strong> Recent drawdowns</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-purple-300 font-bold mb-2">⚙️ Optimizes:</h3>
              <ul className="space-y-1 text-xs">
                <li>• <strong>Confidence:</strong> 30-65% (adaptive)</li>
                <li>• <strong>R:R Ratio:</strong> 1.5-3.0x</li>
                <li>• <strong>Position Size:</strong> 0.6-1.2% of balance</li>
                <li>• <strong>Stops:</strong> 2.5-4.0% (ATR-based)</li>
                <li>• <strong>Targets:</strong> 6-12% (dynamic)</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-purple-500/10 border border-purple-500/30 rounded p-3 mt-4">
            <p className="text-xs text-purple-300">
              <strong>Current Status:</strong> ACTIVE • Micro account mode ({"<"}$100) • 30% confidence threshold • 2.5x R:R ratio • Conservative risk profile
            </p>
          </div>
        </div>
      </motion.div>

      {/* Key Features */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-effect p-6 rounded-lg"
      >
        <h2 className="text-xl font-bold text-neon-green mb-4">Key Features</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-green-500 font-bold mb-2">🧠 AI Technology</h3>
            <ul className="space-y-1 text-xs text-green-500/70">
              <li>• DeepSeek R1 14B (14 billion parameters)</li>
              <li>• RTX 5070 Ti GPU acceleration</li>
              <li>• Chain-of-Thought reasoning enabled</li>
              <li>• 3000-3500 token analysis depth</li>
              <li>• Temperature: 0.6 (deterministic)</li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-green-500 font-bold mb-2">📊 Market Analysis</h3>
            <ul className="space-y-1 text-xs text-green-500/70">
              <li>• Scans top 50 Aster DEX pairs</li>
              <li>• Multi-factor scoring algorithm</li>
              <li>• Batch processing (5 symbols / 5 seconds)</li>
              <li>• Volume microstructure (4 timeframes)</li>
              <li>• Pattern recognition & divergence detection</li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-green-500 font-bold mb-2">🛡️ Risk Management</h3>
            <ul className="space-y-1 text-xs text-green-500/70">
              <li>• Kelly Criterion position sizing</li>
              <li>• ATR-based dynamic stops</li>
              <li>• Confidence-adjusted allocation</li>
              <li>• Max 2x leverage cap</li>
              <li>• 2:1 minimum R:R ratio</li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-green-500 font-bold mb-2">⚡ Execution Quality</h3>
            <ul className="space-y-1 text-xs text-green-500/70">
              <li>• 3 retry attempts with backoff</li>
              <li>• Real-time position monitoring</li>
              <li>• Auto stop-loss/take-profit</li>
              <li>• Trailing stops (2%)</li>
              <li>• Position timeout protection</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

