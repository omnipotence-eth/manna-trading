'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChartLine, Target, Lightbulb, Warning, Shield, Lightning } from 'phosphor-react';

interface AgentThought {
  timestamp: number;
  type: 'ANALYSIS' | 'DECISION' | 'REASONING' | 'ALERT';
  content: string;
  confidence?: number;
  data?: Record<string, any>;
}

interface AgentState {
  id: string;
  name: string;
  role: string;
  status: 'ACTIVE' | 'THINKING' | 'IDLE' | 'WAITING';
  currentTask?: string;
  lastThought: AgentThought | null;
  recentThoughts: AgentThought[];
  metrics: {
    decisionsToday: number;
    accuracy: number;
    avgResponseTime: number;
  };
  personality: {
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    tradingStyle: string;
    focus: string[];
  };
}

interface PortfolioReasoning {
  timestamp: number;
  currentPositions: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    currentPrice: number;
    pnlPercent: number;
    holdReason: string;
    targetAction: string;
    confidence: number;
  }>;
  marketOutlook: {
    shortTerm: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    mediumTerm: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    reasoning: string;
  };
  nextActions: Array<{
    action: string;
    symbol?: string;
    reason: string;
    probability: number;
    timeframe: string;
  }>;
  riskAssessment: {
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    exposure: number;
    concerns: string[];
  };
}

const AGENT_CONFIGS = [
  {
    id: 'technical-analyst',
    name: 'Technical Analyst',
    role: 'Chart & Pattern Analysis',
    icon: <ChartLine size={24} weight="fill" />,
    color: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-500/30',
    personality: {
      riskTolerance: 'MEDIUM' as const,
      tradingStyle: 'Pattern Recognition & Trend Following',
      focus: ['Chart Patterns', 'Support/Resistance', 'Momentum', 'Volume']
    }
  },
  {
    id: 'chief-analyst',
    name: 'Chief Analyst',
    role: 'Final Decision Maker',
    icon: <Target size={24} weight="fill" />,
    color: 'from-purple-500/20 to-pink-500/20',
    borderColor: 'border-purple-500/30',
    personality: {
      riskTolerance: 'MEDIUM' as const,
      tradingStyle: 'Multi-Factor Analysis & Conviction Trading',
      focus: ['Market Sentiment', 'Multi-Timeframe', 'Risk/Reward', 'Timing']
    }
  },
  {
    id: 'risk-manager',
    name: 'Risk Manager',
    role: 'Position Sizing & Protection',
    icon: <Shield size={24} weight="fill" />,
    color: 'from-red-500/20 to-orange-500/20',
    borderColor: 'border-red-500/30',
    personality: {
      riskTolerance: 'LOW' as const,
      tradingStyle: 'Capital Preservation & Drawdown Control',
      focus: ['Stop Loss', 'Position Size', 'Portfolio Risk', 'Correlation']
    }
  },
  {
    id: 'execution-specialist',
    name: 'Execution Specialist',
    role: 'Order Execution & Timing',
    icon: <Lightning size={24} weight="fill" />,
    color: 'from-green-500/20 to-emerald-500/20',
    borderColor: 'border-green-500/30',
    personality: {
      riskTolerance: 'HIGH' as const,
      tradingStyle: 'Optimal Entry & Exit Timing',
      focus: ['Order Book', 'Liquidity', 'Slippage', 'Timing']
    }
  }
];

export default function AgentMinds() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [portfolioReasoning, setPortfolioReasoning] = useState<PortfolioReasoning | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgentStates();
    fetchPortfolioReasoning();
    
    const interval = setInterval(() => {
      fetchAgentStates();
      fetchPortfolioReasoning();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchAgentStates = async () => {
    try {
      const res = await fetch('/api/agents/state');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || getDefaultAgents());
      } else {
        setAgents(getDefaultAgents());
      }
    } catch {
      setAgents(getDefaultAgents());
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolioReasoning = async () => {
    try {
      const res = await fetch('/api/portfolio/reasoning');
      if (res.ok) {
        const data = await res.json();
        setPortfolioReasoning(data.reasoning || null);
      }
    } catch {
      // Use default
    }
  };

  const getDefaultAgents = (): AgentState[] => {
    return AGENT_CONFIGS.map(config => ({
      id: config.id,
      name: config.name,
      role: config.role,
      status: 'IDLE',
      currentTask: undefined,
      lastThought: null,
      recentThoughts: [],
      metrics: {
        decisionsToday: 0,
        accuracy: 0,
        avgResponseTime: 0
      },
      personality: config.personality
    }));
  };

  const getAgentConfig = (id: string) => {
    return AGENT_CONFIGS.find(c => c.id === id) || AGENT_CONFIGS[0];
  };

  if (loading) {
    return (
      <div className="glass-container p-8 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {agents.map(agent => {
          const config = getAgentConfig(agent.id);
          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0.0, 0.2, 1],
                delay: agents.indexOf(agent) * 0.05
              }}
              whileHover={{ 
                scale: 1.02,
                transition: { duration: 0.2, ease: "easeOut" }
              }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
              className={`glass-container p-4 cursor-pointer transition-all ${
                selectedAgent === agent.id ? 'ring-2 ring-white/30' : ''
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.color} flex items-center justify-center text-2xl`}>
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{agent.name}</div>
                  <div className="text-xs text-white/50 truncate">{agent.role}</div>
                </div>
                <StatusBadge status={agent.status} />
              </div>

              {/* Current Task */}
              {agent.currentTask && (
                <div className="text-sm text-white/70 mb-3 p-2 bg-white/5 rounded-lg">
                  <span className="text-white/40">Working on: </span>
                  {agent.currentTask}
                </div>
              )}

              {/* Last Thought */}
              {agent.lastThought && (
                <div className="text-sm mb-3">
                  <div className="flex items-center gap-2 text-white/40 mb-1">
                    <ThoughtIcon type={agent.lastThought.type} />
                    <span>{formatTimeAgo(agent.lastThought.timestamp)}</span>
                  </div>
                  <p className="text-white/70 line-clamp-2">
                    {agent.lastThought.content}
                  </p>
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold">{agent.metrics.decisionsToday}</div>
                  <div className="text-xs text-white/40">Decisions</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-400">
                    {(agent.metrics.accuracy * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-white/40">Accuracy</div>
                </div>
                <div>
                  <div className="text-lg font-bold">
                    {agent.metrics.avgResponseTime.toFixed(1)}s
                  </div>
                  <div className="text-xs text-white/40">Avg Time</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Selected Agent Detail */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-container p-6"
          >
            <AgentDetailView 
              agent={agents.find(a => a.id === selectedAgent)!}
              config={getAgentConfig(selectedAgent)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Portfolio Reasoning Section */}
      <div className="glass-container p-6">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          Portfolio Reasoning
        </h2>
        
        {portfolioReasoning ? (
          <div className="space-y-6">
            {/* Current Positions */}
            {portfolioReasoning.currentPositions.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 text-white/80">Current Positions</h3>
                <div className="space-y-3">
                  {portfolioReasoning.currentPositions.map((pos, i) => (
                    <div key={i} className="p-4 bg-white/5 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${pos.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pos.side}
                          </span>
                          <span className="font-semibold">{pos.symbol}</span>
                        </div>
                        <span className={pos.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-sm text-white/60 mb-2">
                        Entry: ${pos.entryPrice.toFixed(2)} → Current: ${pos.currentPrice.toFixed(2)}
                      </div>
                      <div className="text-sm">
                        <span className="text-white/40">Why holding: </span>
                        <span className="text-white/80">{pos.holdReason}</span>
                      </div>
                      <div className="text-sm mt-1">
                        <span className="text-white/40">Next action: </span>
                        <span className="text-blue-400">{pos.targetAction}</span>
                        <span className="text-white/30 ml-2">({(pos.confidence * 100).toFixed(0)}% confidence)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Market Outlook */}
            <div>
              <h3 className="font-semibold mb-3 text-white/80">Market Outlook</h3>
              <div className="p-4 bg-white/5 rounded-lg">
                <div className="flex gap-4 mb-3">
                  <div>
                    <span className="text-white/40 text-sm">Short-term: </span>
                    <OutlookBadge outlook={portfolioReasoning.marketOutlook.shortTerm} />
                  </div>
                  <div>
                    <span className="text-white/40 text-sm">Medium-term: </span>
                    <OutlookBadge outlook={portfolioReasoning.marketOutlook.mediumTerm} />
                  </div>
                </div>
                <p className="text-white/70 text-sm">
                  {portfolioReasoning.marketOutlook.reasoning}
                </p>
              </div>
            </div>

            {/* Next Actions */}
            <div>
              <h3 className="font-semibold mb-3 text-white/80">Planned Actions</h3>
              <div className="space-y-2">
                {portfolioReasoning.nextActions.map((action, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <div className="flex-1">
                      <span className="font-medium">{action.action}</span>
                      {action.symbol && (
                        <span className="text-blue-400 ml-2">{action.symbol}</span>
                      )}
                      <p className="text-sm text-white/50 mt-1">{action.reason}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{(action.probability * 100).toFixed(0)}%</div>
                      <div className="text-xs text-white/40">{action.timeframe}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Assessment */}
            <div>
              <h3 className="font-semibold mb-3 text-white/80">Risk Assessment</h3>
              <div className="p-4 bg-white/5 rounded-lg">
                <div className="flex items-center gap-4 mb-3">
                  <div>
                    <span className="text-white/40 text-sm">Overall Risk: </span>
                    <RiskBadge risk={portfolioReasoning.riskAssessment.overallRisk} />
                  </div>
                  <div>
                    <span className="text-white/40 text-sm">Exposure: </span>
                    <span className="font-medium">{portfolioReasoning.riskAssessment.exposure.toFixed(1)}%</span>
                  </div>
                </div>
                {portfolioReasoning.riskAssessment.concerns.length > 0 && (
                  <div>
                    <span className="text-white/40 text-sm">Concerns: </span>
                    <ul className="list-disc list-inside text-sm text-yellow-400/80 mt-1">
                      {portfolioReasoning.riskAssessment.concerns.map((concern, i) => (
                        <li key={i}>{concern}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-white/40">
            <div className="text-4xl mb-3">🔍</div>
            <p>No active positions or pending decisions</p>
            <p className="text-sm mt-1">The system is scanning for opportunities...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AgentState['status'] }) {
  const styles = {
    ACTIVE: 'bg-emerald-500/20 text-emerald-400',
    THINKING: 'bg-blue-500/20 text-blue-400 animate-pulse',
    IDLE: 'bg-white/10 text-white/50',
    WAITING: 'bg-yellow-500/20 text-yellow-400'
  };
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function ThoughtIcon({ type }: { type: AgentThought['type'] }) {
  const icons = {
    ANALYSIS: <ChartLine size={16} weight="fill" className="text-blue-400" />,
    DECISION: <Target size={16} weight="fill" className="text-purple-400" />,
    REASONING: <Lightbulb size={16} weight="fill" className="text-yellow-400" />,
    ALERT: <Warning size={16} weight="fill" className="text-red-400" />
  };
  return <span>{icons[type]}</span>;
}

function OutlookBadge({ outlook }: { outlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }) {
  const styles = {
    BULLISH: 'text-emerald-400',
    BEARISH: 'text-red-400',
    NEUTRAL: 'text-white/50'
  };
  return <span className={`font-medium ${styles[outlook]}`}>{outlook}</span>;
}

function RiskBadge({ risk }: { risk: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const styles = {
    LOW: 'text-emerald-400',
    MEDIUM: 'text-yellow-400',
    HIGH: 'text-red-400'
  };
  return <span className={`font-medium ${styles[risk]}`}>{risk}</span>;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function AgentDetailView({ 
  agent, 
  config 
}: { 
  agent: AgentState; 
  config: typeof AGENT_CONFIGS[0];
}) {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${config.color} flex items-center justify-center text-3xl`}>
          {config.icon}
        </div>
        <div>
          <h3 className="text-xl font-bold">{agent.name}</h3>
          <p className="text-white/50">{agent.role}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Personality */}
        <div>
          <h4 className="font-semibold mb-3">Personality Profile</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/50">Risk Tolerance</span>
              <span className={
                agent.personality.riskTolerance === 'HIGH' ? 'text-red-400' :
                agent.personality.riskTolerance === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400'
              }>{agent.personality.riskTolerance}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Trading Style</span>
              <span>{agent.personality.tradingStyle}</span>
            </div>
            <div>
              <span className="text-white/50">Focus Areas:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {agent.personality.focus.map(f => (
                  <span key={f} className="px-2 py-0.5 bg-white/10 rounded text-xs">{f}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Thoughts */}
        <div>
          <h4 className="font-semibold mb-3">Recent Thoughts</h4>
          {agent.recentThoughts.length > 0 ? (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {agent.recentThoughts.slice(0, 5).map((thought, i) => (
                <div key={i} className="text-sm p-2 bg-white/5 rounded">
                  <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                    <ThoughtIcon type={thought.type} />
                    {formatTimeAgo(thought.timestamp)}
                  </div>
                  <p className="text-white/70">{thought.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm">No recent thoughts recorded</p>
          )}
        </div>
      </div>
    </div>
  );
}

