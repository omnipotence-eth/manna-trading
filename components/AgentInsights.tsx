'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { frontendLogger } from '@/lib/frontendLogger';
import { ChartLine, Target, Shield, MagnifyingGlass, Robot } from 'phosphor-react';

interface CoinInsight {
  symbol: string;
  agents: {
    technicalAnalyst: {
      signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      confidence: number;
      reasoning: string;
      indicators: string[];
    };
    chiefAnalyst: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      confidence: number;
      reasoning: string;
    };
    riskManager: {
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      maxPosition: number;
      reasoning: string;
    };
  };
  lastUpdated: number;
}

// Neural network connection animation component
function NeuralConnection({ 
  from, 
  to, 
  active, 
  delay = 0 
}: { 
  from: { x: number; y: number }; 
  to: { x: number; y: number }; 
  active: boolean;
  delay?: number;
}) {
  const pathLength = Math.sqrt(
    Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2)
  );
  
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`gradient-${delay}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00ff88" stopOpacity="0" />
          <stop offset="50%" stopColor="#00ff88" stopOpacity={active ? 0.6 : 0.2} />
          <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="url(#gradient-0)"
        strokeWidth="2"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: active ? 1 : 0.3,
          opacity: active ? 0.6 : 0.1
        }}
        transition={{ 
          duration: 1.5,
          delay,
          repeat: Infinity,
          repeatType: "reverse",
          ease: "easeInOut"
        }}
      />
      {active && (
        <motion.circle
          cx={from.x}
          cy={from.y}
          r="3"
          fill="#00ff88"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
            x: [from.x, to.x],
            y: [from.y, to.y]
          }}
          transition={{
            duration: 2,
            delay,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
    </svg>
  );
}

// Agent node with holographic effect
function AgentNode({ 
  agent, 
  status, 
  position, 
  delay = 0,
  onComplete 
}: { 
  agent: string; 
  status: 'idle' | 'processing' | 'complete';
  position: { x: number; y: number };
  delay?: number;
  onComplete?: () => void;
}) {
  const controls = useAnimation();
  
  useEffect(() => {
    if (status === 'processing') {
      controls.start({
        scale: [1, 1.05, 1],
        boxShadow: [
          '0 0 0px rgba(0, 255, 136, 0)',
          '0 0 20px rgba(0, 255, 136, 0.5)',
          '0 0 0px rgba(0, 255, 136, 0)'
        ]
      });
    } else if (status === 'complete') {
      controls.start({
        scale: 1,
        boxShadow: '0 0 30px rgba(0, 255, 136, 0.6)'
      });
      onComplete?.();
    }
  }, [status, controls, onComplete]);

  const iconMap: Record<string, React.ReactNode> = {
    'Technical Analyst': <ChartLine size={24} weight="fill" />,
    'Chief Analyst': <Target size={24} weight="fill" />,
    'Risk Manager': <Shield size={24} weight="fill" />,
    'Market Scanner': <MagnifyingGlass size={24} weight="fill" />
  };

  return (
    <motion.div
      className="absolute"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        ...controls
      }}
      transition={{ delay, duration: 0.5 }}
    >
      <div className={`
        relative w-16 h-16 rounded-xl border-2 
        ${status === 'processing' ? 'border-[#00ff88] bg-[#00ff88]/10' : 
          status === 'complete' ? 'border-[#00ff88] bg-[#00ff88]/20' : 
          'border-white/20 bg-[#0a0a0a]'}
        flex items-center justify-center backdrop-blur-sm
        transition-all duration-300
      `}>
        <div className="text-[#00ff88]">{iconMap[agent] || <Robot size={24} weight="fill" />}</div>
        {status === 'processing' && (
          <motion.div
            className="absolute inset-0 rounded-xl"
            style={{
              background: 'radial-gradient(circle, rgba(0, 255, 136, 0.2) 0%, transparent 70%)'
            }}
            animate={{
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.2, 1]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        )}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-white/70 whitespace-nowrap">
          {agent.split(' ')[0]}
        </div>
      </div>
    </motion.div>
  );
}

// Data flow particle
function DataParticle({ 
  from, 
  to, 
  delay = 0 
}: { 
  from: { x: number; y: number }; 
  to: { x: number; y: number };
  delay?: number;
}) {
  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full bg-[#00ff88]"
      style={{
        left: from.x,
        top: from.y,
        boxShadow: '0 0 10px rgba(0, 255, 136, 0.8)'
      }}
      initial={{ 
        x: 0, 
        y: 0, 
        opacity: 0,
        scale: 0
      }}
      animate={{ 
        x: to.x - from.x, 
        y: to.y - from.y,
        opacity: [0, 1, 1, 0],
        scale: [0, 1, 1, 0]
      }}
      transition={{
        duration: 1.5,
        delay,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  );
}

export default function AgentInsights() {
  const [insights, setInsights] = useState<CoinInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [decisionFlow, setDecisionFlow] = useState<{
    scanner: 'idle' | 'processing' | 'complete';
    technical: 'idle' | 'processing' | 'complete';
    chief: 'idle' | 'processing' | 'complete';
    risk: 'idle' | 'processing' | 'complete';
  }>({
    scanner: 'idle',
    technical: 'idle',
    chief: 'idle',
    risk: 'idle'
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Agent positions in the neural network visualization
  const agentPositions = {
    scanner: { x: 50, y: 20 },
    technical: { x: 20, y: 50 },
    chief: { x: 50, y: 50 },
    risk: { x: 80, y: 50 }
  };

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        setLoading(true);
        
        // Reset decision flow
        setDecisionFlow({
          scanner: 'processing',
          technical: 'idle',
          chief: 'idle',
          risk: 'idle'
        });

        // Fetch real agent insights from market scanner API
        const response = await fetch('/api/agent-insights?limit=10', {
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch insights: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !result.data?.insights) {
          throw new Error('Invalid API response format');
        }

        const apiInsights = result.data.insights;
        const scanResult = result.data.scanResult;

        // Update decision flow based on actual agent insights
        const hasTechnical = apiInsights.some((i: any) => i.agent === 'Technical Analyst');
        const hasChief = apiInsights.some((i: any) => i.agent === 'Chief Analyst');
        const hasRisk = apiInsights.some((i: any) => i.agent === 'Risk Manager');

        // Simulate decision flow progression based on real data
        setTimeout(() => {
          setDecisionFlow(prev => ({ ...prev, scanner: 'complete', technical: hasTechnical ? 'processing' : 'idle' }));
        }, 800);

        setTimeout(() => {
          setDecisionFlow(prev => ({ ...prev, technical: hasTechnical ? 'complete' : 'idle', chief: hasChief ? 'processing' : 'idle' }));
        }, 1600);

        setTimeout(() => {
          setDecisionFlow(prev => ({ ...prev, chief: hasChief ? 'complete' : 'idle', risk: hasRisk ? 'processing' : 'idle' }));
        }, 2400);

        setTimeout(() => {
          setDecisionFlow(prev => ({ ...prev, risk: hasRisk ? 'complete' : 'idle' }));
        }, 3200);

        // Map API insights to component format
        const coinsToAnalyze: CoinInsight[] = [];
        const symbolMap = new Map<string, CoinInsight>();

        // Group insights by symbol
        apiInsights.forEach((apiInsight: any) => {
          const symbol = apiInsight.symbol === 'MARKET' || apiInsight.symbol === 'PORTFOLIO' 
            ? 'BTC' // Default to BTC for market-wide insights
            : apiInsight.symbol.replace('USDT', '').replace('/', '');

          if (!symbolMap.has(symbol)) {
            symbolMap.set(symbol, {
              symbol,
              agents: {
                technicalAnalyst: {
                  signal: 'NEUTRAL',
                  confidence: 0.5,
                  reasoning: '',
                  indicators: []
                },
                chiefAnalyst: {
                  recommendation: 'HOLD',
                  confidence: 0.5,
                  reasoning: ''
                },
                riskManager: {
                  riskLevel: 'MEDIUM',
                  maxPosition: 2.0,
                  reasoning: ''
                }
              },
              lastUpdated: apiInsight.timestamp || Date.now()
            });
          }

          const insight = symbolMap.get(symbol)!;

          // Map agent insights to component structure
          if (apiInsight.agent === 'Technical Analyst') {
            const action = apiInsight.action || 'HOLD';
            insight.agents.technicalAnalyst = {
              signal: action === 'BUY' ? 'BULLISH' : action === 'SELL' ? 'BEARISH' : 'NEUTRAL',
              confidence: apiInsight.confidence || 0.5,
              reasoning: apiInsight.reasoning || apiInsight.insight || '',
              indicators: apiInsight.marketData?.rsi 
                ? [
                    `RSI: ${apiInsight.marketData.rsi.toFixed(0)}`,
                    `Volatility: ${(apiInsight.marketData.volatility * 100).toFixed(1)}%`,
                    `Liquidity: ${(apiInsight.marketData.liquidityScore * 100).toFixed(0)}%`
                  ]
                : []
            };
          } else if (apiInsight.agent === 'Chief Analyst') {
            insight.agents.chiefAnalyst = {
              recommendation: (apiInsight.action as 'BUY' | 'SELL' | 'HOLD') || 'HOLD',
              confidence: apiInsight.confidence || 0.5,
              reasoning: apiInsight.reasoning || apiInsight.insight || ''
            };
          } else if (apiInsight.agent === 'Risk Manager') {
            const volatility = apiInsight.marketData?.volatility || 0;
            insight.agents.riskManager = {
              riskLevel: volatility > 0.05 ? 'HIGH' : volatility > 0.02 ? 'MEDIUM' : 'LOW',
              maxPosition: 2.5, // Default position size
              reasoning: apiInsight.reasoning || apiInsight.insight || ''
            };
          }
        });

        coinsToAnalyze.push(...Array.from(symbolMap.values()));

        // If no insights, add default BTC insight
        if (coinsToAnalyze.length === 0 && scanResult?.bestOpportunity) {
          const best = scanResult.bestOpportunity;
          coinsToAnalyze.push({
            symbol: best.symbol.replace('USDT', '').replace('/', ''),
            agents: {
              technicalAnalyst: {
                signal: best.recommendation.includes('BUY') ? 'BULLISH' : best.recommendation.includes('SELL') ? 'BEARISH' : 'NEUTRAL',
                confidence: best.confidence || 0.5,
                reasoning: best.reasoning?.[0] || 'Market analysis complete',
                indicators: best.signals?.slice(0, 3) || []
              },
              chiefAnalyst: {
                recommendation: best.recommendation.includes('BUY') ? 'BUY' : best.recommendation.includes('SELL') ? 'SELL' : 'HOLD',
                confidence: best.confidence || 0.5,
                reasoning: best.reasoning?.[0] || 'Top opportunity identified'
              },
              riskManager: {
                riskLevel: best.marketData?.volatility > 0.05 ? 'HIGH' : 'MEDIUM',
                maxPosition: 2.5,
                reasoning: 'Risk assessment based on market volatility'
              }
            },
            lastUpdated: Date.now()
          });
        }

        setInsights(coinsToAnalyze);
      } catch (error) {
        frontendLogger.error('Failed to fetch insights', error instanceof Error ? error : new Error(String(error)), {
          component: 'AgentInsights',
          action: 'fetchInsights',
        });
        setInsights([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
    const interval = setInterval(fetchInsights, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const generateInsight = (symbol: string, pos: any): CoinInsight => {
    const pnl = pos.pnl || 0;
    const pnlPercent = pos.pnlPercent || 0;
    
    return {
      symbol,
      agents: {
        technicalAnalyst: {
          signal: pnl > 0 ? 'BULLISH' : pnl < 0 ? 'BEARISH' : 'NEUTRAL',
          confidence: Math.min(0.9, 0.6 + Math.abs(pnlPercent) / 100),
          reasoning: pnl > 0 
            ? `Position in profit. Momentum favorable.`
            : `Position underwater. Watching for reversal signals.`,
          indicators: pnl > 0 
            ? ['RSI trending up', 'MACD positive', 'Above 20 EMA']
            : ['RSI oversold', 'MACD divergence', 'Testing support']
        },
        chiefAnalyst: {
          recommendation: pos.side === 'LONG' 
            ? (pnl > 0 ? 'HOLD' : 'HOLD') 
            : (pnl > 0 ? 'HOLD' : 'HOLD'),
          confidence: 0.7,
          reasoning: `${pos.side} position at ${pos.leverage}x. ${pnl > 0 ? 'Let winner run.' : 'Approaching stop level.'}`
        },
        riskManager: {
          riskLevel: Math.abs(pnlPercent) > 5 ? 'HIGH' : Math.abs(pnlPercent) > 2 ? 'MEDIUM' : 'LOW',
          maxPosition: 2.5,
          reasoning: `Current exposure within limits. Trailing stop active.`
        }
      },
      lastUpdated: Date.now()
    };
  };

  const generateInsightFromMarket = (symbol: string, marketData: any): CoinInsight => {
    const bias = marketData?.overallBias || 'NEUTRAL';
    const rsi = marketData?.technicals?.rsi14 || 50;
    
    return {
      symbol,
      agents: {
        technicalAnalyst: {
          signal: bias.includes('BUY') ? 'BULLISH' : bias.includes('SELL') ? 'BEARISH' : 'NEUTRAL',
          confidence: marketData?.confidence || 0.5,
          reasoning: `RSI at ${rsi?.toFixed(0)}. ${rsi < 30 ? 'Oversold conditions.' : rsi > 70 ? 'Overbought conditions.' : 'Neutral momentum.'}`,
          indicators: [
            `RSI: ${rsi?.toFixed(0)}`,
            `Trend: ${marketData?.regime?.regime || 'RANGING'}`,
            `Vol: ${marketData?.volatility?.volatilityRegime || 'NORMAL'}`
          ]
        },
        chiefAnalyst: {
          recommendation: bias.includes('BUY') ? 'BUY' : bias.includes('SELL') ? 'SELL' : 'HOLD',
          confidence: marketData?.confidence || 0.5,
          reasoning: `Market ${bias.toLowerCase().replace('_', ' ')}. ${marketData?.sentiment?.fearGreedLabel || 'Neutral'} sentiment.`
        },
        riskManager: {
          riskLevel: (marketData?.volatility?.volatilityRegime === 'HIGH' || marketData?.volatility?.volatilityRegime === 'EXTREME_HIGH') ? 'HIGH' : 'MEDIUM',
          maxPosition: 2.0,
          reasoning: `Volatility ${marketData?.volatility?.volatilityRegime?.toLowerCase() || 'normal'}. Conservative sizing recommended.`
        }
      },
      lastUpdated: Date.now()
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="relative">
          <motion.div
            className="w-12 h-12 border-2 border-white/20 border-t-[#00ff88] rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-0 w-12 h-12 border-2 border-transparent border-r-[#00ff88]/50 rounded-full"
            animate={{ rotate: -360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <motion.div
          className="w-10 h-10 rounded-lg bg-[#111] border border-white/[0.08] flex items-center justify-center mb-3"
          animate={{ 
            boxShadow: [
              '0 0 0px rgba(0, 255, 136, 0)',
              '0 0 20px rgba(0, 255, 136, 0.5)',
              '0 0 0px rgba(0, 255, 136, 0)'
            ]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="text-lg">🔍</span>
        </motion.div>
        <p className="text-[12px] text-[#888]">Scanning markets...</p>
        <p className="text-[11px] text-[#555] mt-1">No active analysis</p>
      </div>
    );
  }

  const selected = insights.find(i => i.symbol === selectedCoin) || insights[0];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-black">
      {/* Neural Network Visualization */}
      <div className="relative h-32 border-b border-white/[0.05] bg-gradient-to-b from-[#0a0a0a] to-transparent overflow-hidden">
        <div ref={containerRef} className="relative w-full h-full">
          {/* Agent Nodes */}
          <AgentNode
            agent="Market Scanner"
            status={decisionFlow.scanner}
            position={agentPositions.scanner}
            delay={0}
          />
          <AgentNode
            agent="Technical Analyst"
            status={decisionFlow.technical}
            position={agentPositions.technical}
            delay={0.8}
          />
          <AgentNode
            agent="Chief Analyst"
            status={decisionFlow.chief}
            position={agentPositions.chief}
            delay={1.6}
          />
          <AgentNode
            agent="Risk Manager"
            status={decisionFlow.risk}
            position={agentPositions.risk}
            delay={2.4}
          />

          {/* Neural Connections */}
          {decisionFlow.scanner !== 'idle' && (
            <>
              <NeuralConnection
                from={agentPositions.scanner}
                to={agentPositions.technical}
                active={decisionFlow.technical === 'processing' || decisionFlow.technical === 'complete'}
                delay={0.8}
              />
              <NeuralConnection
                from={agentPositions.scanner}
                to={agentPositions.chief}
                active={decisionFlow.chief === 'processing' || decisionFlow.chief === 'complete'}
                delay={1.6}
              />
            </>
          )}
          {decisionFlow.technical !== 'idle' && (
            <NeuralConnection
              from={agentPositions.technical}
              to={agentPositions.chief}
              active={decisionFlow.chief === 'processing' || decisionFlow.chief === 'complete'}
              delay={1.6}
            />
          )}
          {decisionFlow.chief !== 'idle' && (
            <NeuralConnection
              from={agentPositions.chief}
              to={agentPositions.risk}
              active={decisionFlow.risk === 'processing' || decisionFlow.risk === 'complete'}
              delay={2.4}
            />
          )}

          {/* Data Particles */}
          {decisionFlow.scanner === 'complete' && decisionFlow.technical === 'processing' && (
            <DataParticle
              from={agentPositions.scanner}
              to={agentPositions.technical}
              delay={0.8}
            />
          )}
          {decisionFlow.technical === 'complete' && decisionFlow.chief === 'processing' && (
            <DataParticle
              from={agentPositions.technical}
              to={agentPositions.chief}
              delay={1.6}
            />
          )}
          {decisionFlow.chief === 'complete' && decisionFlow.risk === 'processing' && (
            <DataParticle
              from={agentPositions.chief}
              to={agentPositions.risk}
              delay={2.4}
            />
          )}
        </div>
      </div>

      {/* Coin Selector */}
      <div className="flex gap-1 p-2 border-b border-white/[0.05] overflow-x-auto bg-[#0a0a0a]">
        {insights.map((insight) => (
          <motion.button
            key={insight.symbol}
            onClick={() => setSelectedCoin(insight.symbol)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`px-3 py-1.5 rounded text-[11px] font-medium transition-all whitespace-nowrap ${
              (selectedCoin || insights[0].symbol) === insight.symbol
                ? 'bg-[#00ff88] text-black'
                : 'text-[#888] hover:text-white hover:bg-white/5'
            }`}
          >
            {insight.symbol}
          </motion.button>
        ))}
      </div>

      {/* Agent Decision Cards with Futuristic Design */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Technical Analyst */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="relative p-4 rounded-xl bg-gradient-to-br from-[#0f0f0f] to-[#0a0a0a] border border-white/[0.08] overflow-hidden"
        >
          {/* Holographic border effect */}
          <motion.div
            className="absolute inset-0 rounded-xl"
            style={{
              background: 'linear-gradient(45deg, transparent 30%, rgba(0, 255, 136, 0.1) 50%, transparent 70%)',
              backgroundSize: '200% 200%'
            }}
            animate={{
              backgroundPosition: ['0% 0%', '200% 200%']
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear"
            }}
          />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="text-[#00ff88]">
                  <ChartLine size={20} weight="fill" />
                </div>
                <span className="text-[12px] font-semibold text-white">Technical Analyst</span>
              </div>
              <motion.span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  selected.agents.technicalAnalyst.signal === 'BULLISH' 
                    ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30' 
                    : selected.agents.technicalAnalyst.signal === 'BEARISH'
                    ? 'bg-[#ff4444]/20 text-[#ff4444] border border-[#ff4444]/30'
                    : 'bg-white/10 text-[#888] border border-white/10'
                }`}
                animate={{
                  boxShadow: selected.agents.technicalAnalyst.signal === 'BULLISH' 
                    ? ['0 0 0px rgba(0, 255, 136, 0)', '0 0 15px rgba(0, 255, 136, 0.5)', '0 0 0px rgba(0, 255, 136, 0)']
                    : []
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {selected.agents.technicalAnalyst.signal}
              </motion.span>
            </div>
            <p className="text-[11px] text-[#aaa] mb-3 leading-relaxed">
              {selected.agents.technicalAnalyst.reasoning}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selected.agents.technicalAnalyst.indicators.map((ind, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="text-[9px] px-2 py-1 bg-[#00ff88]/10 border border-[#00ff88]/20 rounded text-[#00ff88]/80"
                >
                  {ind}
                </motion.span>
              ))}
            </div>
            {/* Confidence meter */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#00ff88] to-[#00ff88]/50 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${selected.agents.technicalAnalyst.confidence * 100}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
              <span className="text-[9px] text-[#666] font-mono">
                {(selected.agents.technicalAnalyst.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </motion.div>

        {/* Chief Analyst */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="relative p-4 rounded-xl bg-gradient-to-br from-[#0f0f0f] to-[#0a0a0a] border border-white/[0.08] overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 rounded-xl"
            style={{
              background: 'linear-gradient(45deg, transparent 30%, rgba(0, 255, 136, 0.1) 50%, transparent 70%)',
              backgroundSize: '200% 200%'
            }}
            animate={{
              backgroundPosition: ['0% 0%', '200% 200%']
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear"
            }}
          />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-[#00ff88]"
                >
                  <Target size={20} weight="fill" />
                </motion.div>
                <span className="text-[12px] font-semibold text-white">Chief Analyst</span>
              </div>
              <motion.span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  selected.agents.chiefAnalyst.recommendation === 'BUY' 
                    ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30' 
                    : selected.agents.chiefAnalyst.recommendation === 'SELL'
                    ? 'bg-[#ff4444]/20 text-[#ff4444] border border-[#ff4444]/30'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }`}
                animate={{
                  boxShadow: selected.agents.chiefAnalyst.recommendation === 'BUY' 
                    ? ['0 0 0px rgba(0, 255, 136, 0)', '0 0 15px rgba(0, 255, 136, 0.5)', '0 0 0px rgba(0, 255, 136, 0)']
                    : []
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {selected.agents.chiefAnalyst.recommendation}
              </motion.span>
            </div>
            <p className="text-[11px] text-[#aaa] mb-3 leading-relaxed">
              {selected.agents.chiefAnalyst.reasoning}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    selected.agents.chiefAnalyst.recommendation === 'BUY'
                      ? 'bg-gradient-to-r from-[#00ff88] to-[#00ff88]/50'
                      : selected.agents.chiefAnalyst.recommendation === 'SELL'
                      ? 'bg-gradient-to-r from-[#ff4444] to-[#ff4444]/50'
                      : 'bg-gradient-to-r from-blue-500 to-blue-500/50'
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${selected.agents.chiefAnalyst.confidence * 100}%` }}
                  transition={{ duration: 1, delay: 0.6 }}
                />
              </div>
              <span className="text-[9px] text-[#666] font-mono">
                {(selected.agents.chiefAnalyst.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </motion.div>

        {/* Risk Manager */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="relative p-4 rounded-xl bg-gradient-to-br from-[#0f0f0f] to-[#0a0a0a] border border-white/[0.08] overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 rounded-xl"
            style={{
              background: 'linear-gradient(45deg, transparent 30%, rgba(0, 255, 136, 0.1) 50%, transparent 70%)',
              backgroundSize: '200% 200%'
            }}
            animate={{
              backgroundPosition: ['0% 0%', '200% 200%']
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear"
            }}
          />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Shield size={18} weight="fill" className="text-[#00ff88]" />
                </motion.div>
                <span className="text-[12px] font-semibold text-white">Risk Manager</span>
              </div>
              <motion.span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  selected.agents.riskManager.riskLevel === 'LOW' 
                    ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30' 
                    : selected.agents.riskManager.riskLevel === 'HIGH'
                    ? 'bg-[#ff4444]/20 text-[#ff4444] border border-[#ff4444]/30'
                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                }`}
              >
                {selected.agents.riskManager.riskLevel} RISK
              </motion.span>
            </div>
            <p className="text-[11px] text-[#aaa] mb-3 leading-relaxed">
              {selected.agents.riskManager.reasoning}
            </p>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[#666]">Max Position:</span>
              <motion.span
                className="text-[#00ff88] font-mono font-semibold"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                {selected.agents.riskManager.maxPosition}%
              </motion.span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
