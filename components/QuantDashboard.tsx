'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { frontendLogger } from '@/lib/frontendLogger';
import TradeVisualization from './TradeVisualization';
import AgentMinds from './AgentMinds';
import { useStore } from '@/store/useStore';
import { 
  LineChart, DollarSign, Brain, TrendingUp, Rocket, Banknote, Target, AlertTriangle,
  TrendingDown, Waves, Smile, Flame, Snowflake, Bot, Mail, Radio, Wand2, CircleDot
} from 'lucide-react';

type TabType = 'overview' | 'trades' | 'agents' | 'quant' | 'growth';

interface QuantData {
  price: any;
  technicals: any;
  derivatives: any;
  sentiment: any;
  volatility: any;
  regime: any;
  bullishScore: number;
  bearishScore: number;
  overallBias: string;
  confidence: number;
}

interface GrowthData {
  growth: any;
  qualityGate: any;
  nextMilestone: any;
  sizing: any;
  mlReadiness: any;
}

export default function QuantDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [quantData, setQuantData] = useState<QuantData | null>(null);
  const [growthData, setGrowthData] = useState<GrowthData | null>(null);
  const setAccountValue = useStore((s) => s.setAccountValue);
  const accountValue = useStore((s) => s.accountValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAllData = async () => {
    try {
      const [quantRes, growthRes, balanceRes] = await Promise.all([
        fetch('/api/quant-data?symbol=BTCUSDT'),
        fetch('/api/growth'),
        fetch('/api/optimized-data')
      ]);

      if (quantRes.ok) {
        const data = await quantRes.json();
        setQuantData(data.data);
      }

      if (growthRes.ok) {
        const data = await growthRes.json();
        setGrowthData(data);
      }

      if (balanceRes.ok) {
        const data = await balanceRes.json();
        if (data?.data?.accountValue !== undefined) {
          setAccountValue(data.data.accountValue);
        } else if (data.accountValue !== undefined) {
          setAccountValue(data.accountValue);
        }
      }
    } catch (error) {
      frontendLogger.error('Failed to fetch data', error instanceof Error ? error : new Error(String(error)), {
        component: 'QuantDashboard',
        action: 'fetchAllData',
      });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LineChart size={18} /> },
    { id: 'trades', label: 'Trades', icon: <DollarSign size={18} /> },
    { id: 'agents', label: 'AI Agents', icon: <Brain size={18} /> },
    { id: 'quant', label: 'Quant Data', icon: <TrendingUp size={18} /> },
    { id: 'growth', label: 'Growth', icon: <Rocket size={18} /> }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Tab Navigation */}
      <div className="sticky top-0 z-40 glass-container border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 py-2 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-black'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="text-white">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0.0, 0.2, 1]
              }}
            >
              <OverviewTab 
                quantData={quantData} 
                growthData={growthData}
                accountValue={accountValue}
                loading={loading}
              />
            </motion.div>
          )}

          {activeTab === 'trades' && (
            <motion.div
              key="trades"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0.0, 0.2, 1]
              }}
            >
              <TradeVisualization />
            </motion.div>
          )}

          {activeTab === 'agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0.0, 0.2, 1]
              }}
            >
              <AgentMinds />
            </motion.div>
          )}

          {activeTab === 'quant' && (
            <motion.div
              key="quant"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0.0, 0.2, 1]
              }}
            >
              <QuantDataTab quantData={quantData} loading={loading} />
            </motion.div>
          )}

          {activeTab === 'growth' && (
            <motion.div
              key="growth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0.0, 0.2, 1]
              }}
            >
              <GrowthTab growthData={growthData} loading={loading} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ 
  quantData, 
  growthData, 
  accountValue,
  loading 
}: { 
  quantData: QuantData | null;
  growthData: GrowthData | null;
  accountValue: number;
  loading: boolean;
}) {
  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HeroCard
          label="Portfolio Value"
          value={`$${accountValue.toFixed(2)}`}
          icon={<Banknote size={18} />}
          color="white"
        />
        <HeroCard
          label="Market Bias"
          value={quantData?.overallBias || 'NEUTRAL'}
          icon={<Target size={18} />}
          color={quantData?.overallBias?.includes('BUY') ? 'green' : 
                 quantData?.overallBias?.includes('SELL') ? 'red' : 'yellow'}
        />
        <HeroCard
          label="Position Size"
          value={`${growthData?.sizing?.positionSizePercent?.toFixed(1) || '1.0'}%`}
          subValue={growthData?.sizing?.tier || 'CONSERVATIVE'}
          icon={<LineChart size={18} />}
          color="blue"
        />
        <HeroCard
          label="Fear & Greed"
          value={quantData?.sentiment?.fearGreedIndex?.toString() || '50'}
          subValue={quantData?.sentiment?.fearGreedLabel || 'NEUTRAL'}
          icon={<AlertTriangle size={18} />}
          color={
            (quantData?.sentiment?.fearGreedIndex || 50) < 30 ? 'red' :
            (quantData?.sentiment?.fearGreedIndex || 50) > 70 ? 'green' : 'yellow'
          }
        />
      </div>

      {/* Market Signals */}
      <div className="glass-container p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Radio size={20} className="text-[#00ff88]" /> Live Market Signals
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <SignalCard
            title="Bullish Score"
            value={quantData?.bullishScore || 0}
            max={100}
            color="emerald"
          />
          <SignalCard
            title="Bearish Score"
            value={quantData?.bearishScore || 0}
            max={100}
            color="red"
          />
          <SignalCard
            title="Confidence"
            value={(quantData?.confidence || 0) * 100}
            max={100}
            color="blue"
          />
        </div>
      </div>

      {/* Technical Summary */}
      {quantData?.technicals && (
        <div className="glass-container p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <LineChart size={20} className="text-[#00ff88]" /> Technical Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TechIndicator 
              name="RSI (14)" 
              value={quantData.technicals.rsi14?.toFixed(1) || '50'} 
              status={
                quantData.technicals.rsi14 < 30 ? 'oversold' :
                quantData.technicals.rsi14 > 70 ? 'overbought' : 'neutral'
              }
            />
            <TechIndicator 
              name="MACD" 
              value={quantData.technicals.macdHistogram?.toFixed(4) || '0'} 
              status={quantData.technicals.macdHistogram > 0 ? 'bullish' : 'bearish'}
            />
            <TechIndicator 
              name="Trend" 
              value={quantData.technicals.trendStrength || 'NONE'} 
              status={quantData.regime?.regime?.includes('UPTREND') ? 'bullish' : 
                      quantData.regime?.regime?.includes('DOWNTREND') ? 'bearish' : 'neutral'}
            />
            <TechIndicator 
              name="BB %B" 
              value={((quantData.technicals.bbPercentB || 0.5) * 100).toFixed(0) + '%'} 
              status={
                quantData.technicals.bbPercentB < 0.2 ? 'oversold' :
                quantData.technicals.bbPercentB > 0.8 ? 'overbought' : 'neutral'
              }
            />
          </div>
        </div>
      )}

      {/* Next Milestone */}
      {growthData?.nextMilestone && (
        <div className="glass-container p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Target size={20} className="text-[#00ff88]" /> Next Milestone
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="font-semibold text-xl">{growthData.nextMilestone.milestone}</div>
              <div className="text-white/50 text-sm">
                ${growthData.nextMilestone.amountNeeded?.toFixed(2)} to go
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-emerald-400">
                {growthData.nextMilestone.progress?.toFixed(0)}%
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-500 to-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${growthData.nextMilestone.progress || 0}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-2 text-sm text-white/50">
            {growthData.nextMilestone.reward}
          </div>
        </div>
      )}
    </div>
  );
}

// Quant Data Tab Component
function QuantDataTab({ quantData, loading }: { quantData: QuantData | null; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (!quantData) return <EmptyState message="No quant data available" />;

  return (
    <div className="space-y-6">
      {/* Price Data */}
      <DataSection title="Price Data" icon={<DollarSign size={20} className="text-[#00ff88]" />}>
        <DataGrid data={[
          { label: 'Current', value: `$${quantData.price?.close?.toFixed(2) || 0}` },
          { label: '24h High', value: `$${quantData.price?.dailyHigh?.toFixed(2) || 0}` },
          { label: '24h Low', value: `$${quantData.price?.dailyLow?.toFixed(2) || 0}` },
          { label: 'VWAP', value: `$${quantData.price?.vwap?.toFixed(2) || 0}` },
          { label: '1h Change', value: `${quantData.price?.change1h?.toFixed(2) || 0}%`, colored: true },
          { label: '24h Change', value: `${quantData.price?.change24h?.toFixed(2) || 0}%`, colored: true },
        ]} />
      </DataSection>

      {/* Technical Indicators */}
      <DataSection title="Technical Indicators" icon={<TrendingUp size={20} className="text-[#00ff88]" />}>
        <DataGrid data={[
          { label: 'RSI (14)', value: quantData.technicals?.rsi14?.toFixed(1) || 'N/A' },
          { label: 'MACD', value: quantData.technicals?.macd?.toFixed(4) || 'N/A' },
          { label: 'Signal', value: quantData.technicals?.macdSignal?.toFixed(4) || 'N/A' },
          { label: 'ATR (14)', value: quantData.technicals?.atr14?.toFixed(2) || 'N/A' },
          { label: 'ADX', value: quantData.technicals?.adx14?.toFixed(1) || 'N/A' },
          { label: 'BB Upper', value: `$${quantData.technicals?.bbUpper?.toFixed(2) || 'N/A'}` },
          { label: 'BB Middle', value: `$${quantData.technicals?.bbMiddle?.toFixed(2) || 'N/A'}` },
          { label: 'BB Lower', value: `$${quantData.technicals?.bbLower?.toFixed(2) || 'N/A'}` },
        ]} />
      </DataSection>

      {/* Derivatives */}
      <DataSection title="Derivatives Data" icon={<LineChart size={20} className="text-[#00ff88]" />}>
        <DataGrid data={[
          { label: 'Funding Rate', value: `${(quantData.derivatives?.fundingRate * 100)?.toFixed(4) || 0}%` },
          { label: 'Funding (Ann.)', value: `${quantData.derivatives?.fundingRateAnnualized?.toFixed(1) || 0}%` },
          { label: 'Open Interest', value: `$${(quantData.derivatives?.openInterestValue / 1000000)?.toFixed(2) || 0}M` },
          { label: 'Long/Short', value: quantData.derivatives?.longShortRatio?.toFixed(2) || 'N/A' },
          { label: 'Sentiment', value: quantData.derivatives?.derivativesSentiment || 'NEUTRAL' },
        ]} />
      </DataSection>

      {/* Volatility */}
      <DataSection title="Volatility Metrics" icon={<TrendingDown size={20} className="text-[#00ff88]" />}>
        <DataGrid data={[
          { label: '1h Vol', value: `${quantData.volatility?.volatility1h?.toFixed(2) || 0}%` },
          { label: '24h Vol', value: `${quantData.volatility?.volatility24h?.toFixed(2) || 0}%` },
          { label: '7d Vol', value: `${quantData.volatility?.volatility7d?.toFixed(2) || 0}%` },
          { label: 'Regime', value: quantData.volatility?.volatilityRegime || 'NORMAL' },
          { label: 'Max Move 24h', value: `±$${quantData.volatility?.maxMove24h?.toFixed(2) || 0}` },
        ]} />
      </DataSection>

      {/* Market Regime */}
      <DataSection title="Market Regime" icon={<Waves size={20} className="text-[#00ff88]" />}>
        <DataGrid data={[
          { label: 'Regime', value: quantData.regime?.regime || 'RANGING' },
          { label: 'Confidence', value: `${quantData.regime?.regimeConfidence || 0}%` },
          { label: 'Short Trend', value: quantData.regime?.shortTermTrend || 'NEUTRAL' },
          { label: 'Medium Trend', value: quantData.regime?.mediumTermTrend || 'NEUTRAL' },
          { label: 'Long Trend', value: quantData.regime?.longTermTrend || 'NEUTRAL' },
          { label: 'Aligned', value: quantData.regime?.trendAlignment ? 'YES' : 'NO' },
          { label: 'Cycle Phase', value: quantData.regime?.cyclePhase || 'N/A' },
          { label: 'Momentum', value: quantData.regime?.momentum?.toFixed(0) || '0' },
        ]} />
      </DataSection>

      {/* Sentiment */}
      <DataSection title="Sentiment" icon={<Smile size={20} className="text-[#00ff88]" />}>
        <DataGrid data={[
          { label: 'Fear & Greed', value: quantData.sentiment?.fearGreedIndex?.toString() || '50' },
          { label: 'Label', value: quantData.sentiment?.fearGreedLabel || 'NEUTRAL' },
          { label: 'BTC Dom', value: `${quantData.sentiment?.btcDominance?.toFixed(1) || 50}%` },
          { label: 'ETH Dom', value: `${quantData.sentiment?.ethDominance?.toFixed(1) || 18}%` },
          { label: 'Altcoin Season', value: quantData.sentiment?.altcoinSeason ? 'YES' : 'NO' },
        ]} />
      </DataSection>
    </div>
  );
}

// Growth Tab Component
function GrowthTab({ growthData, loading }: { growthData: GrowthData | null; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (!growthData) return <EmptyState message="No growth data available" />;

  return (
    <div className="space-y-6">
      {/* Growth Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HeroCard
          label="Total Growth"
          value={`${growthData.growth?.totalGrowthPercent?.toFixed(1) || 0}%`}
          icon={<TrendingUp size={18} />}
          color={growthData.growth?.totalGrowthPercent >= 0 ? 'green' : 'red'}
        />
        <HeroCard
          label="Win Rate"
          value={`${((growthData.growth?.winRate || 0) * 100).toFixed(0)}%`}
          icon={<Target size={18} />}
          color={(growthData.growth?.winRate || 0) >= 0.5 ? 'green' : 'red'}
        />
        <HeroCard
          label="Profit Factor"
          value={growthData.growth?.profitFactor?.toFixed(2) || '0'}
          icon={<Banknote size={18} />}
          color={(growthData.growth?.profitFactor || 0) >= 1.5 ? 'green' : 
                 (growthData.growth?.profitFactor || 0) >= 1 ? 'yellow' : 'red'}
        />
        <HeroCard
          label="Current Streak"
          value={growthData.growth?.currentStreak?.toString() || '0'}
          subValue={growthData.growth?.currentStreak > 0 ? 'wins' : 'losses'}
          icon={growthData.growth?.currentStreak > 0 ? <Flame size={18} /> : <Snowflake size={18} />}
          color={growthData.growth?.currentStreak > 0 ? 'green' : 'red'}
        />
      </div>

      {/* Projections */}
      <div className="glass-container p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Wand2 size={20} className="text-[#00ff88]" /> Growth Projections
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-white/5 rounded-lg text-center">
            <div className="text-white/50 text-sm mb-1">Current Balance</div>
            <div className="text-2xl font-bold">${growthData.growth?.currentBalance?.toFixed(2) || 0}</div>
          </div>
          <div className="p-4 bg-emerald-500/10 rounded-lg text-center">
            <div className="text-white/50 text-sm mb-1">At 100 Trades</div>
            <div className="text-2xl font-bold text-emerald-400">
              ${growthData.growth?.projectedAt100?.toFixed(2) || 0}
            </div>
          </div>
          <div className="p-4 bg-blue-500/10 rounded-lg text-center">
            <div className="text-white/50 text-sm mb-1">At 500 Trades</div>
            <div className="text-2xl font-bold text-blue-400">
              ${growthData.growth?.projectedAt500?.toFixed(2) || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Quality Gate */}
      <div className="glass-container p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CircleDot size={20} className="text-[#00ff88]" /> Current Quality Gate: {growthData.qualityGate?.name || 'CONSERVATIVE'}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-white/50">Min Confidence</span>
            <div className="font-semibold">{((growthData.qualityGate?.minConfidence || 0.7) * 100).toFixed(0)}%</div>
          </div>
          <div>
            <span className="text-white/50">Min R:R</span>
            <div className="font-semibold">{growthData.qualityGate?.minRiskReward?.toFixed(1) || '2.5'}:1</div>
          </div>
          <div>
            <span className="text-white/50">Max Spread</span>
            <div className="font-semibold">{growthData.qualityGate?.maxSpread?.toFixed(1) || '0.2'}%</div>
          </div>
          <div>
            <span className="text-white/50">Min Liquidity</span>
            <div className="font-semibold">${((growthData.qualityGate?.minLiquidity || 1500000) / 1000000).toFixed(1)}M</div>
          </div>
        </div>
      </div>

      {/* ML Readiness */}
      <div className="glass-container p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Bot size={20} className="text-[#00ff88]" /> ML Training Readiness
        </h3>
        <div className="flex items-center gap-4 mb-4">
          <div className={`px-4 py-2 rounded-lg font-semibold ${
            growthData.mlReadiness?.level === 'EXCELLENT' ? 'bg-emerald-500/20 text-emerald-400' :
            growthData.mlReadiness?.level === 'GOOD' ? 'bg-blue-500/20 text-blue-400' :
            growthData.mlReadiness?.level === 'MINIMUM' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {growthData.mlReadiness?.level || 'NOT_READY'}
          </div>
          <div className="text-white/50 text-sm">
            {growthData.mlReadiness?.recommendation}
          </div>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-yellow-500 via-emerald-500 to-blue-500"
            style={{ width: `${growthData.mlReadiness?.progress || 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper Components
function LoadingState() {
  return (
    <div className="glass-container p-12 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-container p-12 text-center">
      <Mail size={48} className="text-white/30 mx-auto mb-4" />
      <div className="text-white/50">{message}</div>
    </div>
  );
}

function HeroCard({ 
  label, 
  value, 
  subValue,
  icon, 
  color 
}: { 
  label: string; 
  value: string; 
  subValue?: string;
  icon: React.ReactNode; 
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    white: 'text-white',
    green: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    blue: 'text-blue-400'
  };

  return (
    <div className="glass-container p-4">
      <div className="flex items-center gap-2 text-white/50 text-sm mb-1">
        <span>{icon}</span>
        {label}
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color] || 'text-white'}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-white/40 mt-1">{subValue}</div>
      )}
    </div>
  );
}

function SignalCard({ 
  title, 
  value, 
  max, 
  color 
}: { 
  title: string; 
  value: number; 
  max: number; 
  color: string;
}) {
  const percent = (value / max) * 100;
  
  return (
    <div className="p-4 bg-white/5 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <span className="text-white/70 text-sm">{title}</span>
        <span className="font-bold">{value.toFixed(0)}</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-${color}-500 rounded-full transition-all`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function TechIndicator({ 
  name, 
  value, 
  status 
}: { 
  name: string; 
  value: string; 
  status: 'bullish' | 'bearish' | 'neutral' | 'overbought' | 'oversold';
}) {
  const statusColors: Record<string, string> = {
    bullish: 'text-emerald-400',
    bearish: 'text-red-400',
    neutral: 'text-white/70',
    overbought: 'text-orange-400',
    oversold: 'text-blue-400'
  };

  return (
    <div className="p-3 bg-white/5 rounded-lg">
      <div className="text-white/50 text-xs mb-1">{name}</div>
      <div className={`font-bold ${statusColors[status]}`}>{value}</div>
    </div>
  );
}

function DataSection({ 
  title, 
  icon, 
  children 
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
}) {
  return (
    <div className="glass-container p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function DataGrid({ 
  data 
}: { 
  data: Array<{ label: string; value: string; colored?: boolean }>;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {data.map((item, i) => (
        <div key={i} className="p-3 bg-white/5 rounded-lg">
          <div className="text-white/50 text-xs mb-1">{item.label}</div>
          <div className={`font-medium ${
            item.colored 
              ? parseFloat(item.value) >= 0 
                ? 'text-emerald-400' 
                : 'text-red-400'
              : 'text-white'
          }`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

