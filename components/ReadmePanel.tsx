'use client';

import { motion } from 'framer-motion';

export default function ReadmePanel() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="font-mono text-xs text-green-500 space-y-4"
    >
      <div>
        <div className="text-neon-blue mb-2">═══════════════════════════════════════</div>
        <div className="text-lg font-bold">MANNA AI ARENA - README.TXT</div>
        <div className="text-neon-blue mb-2">═══════════════════════════════════════</div>
      </div>

      <div>
        <div className="text-neon-green font-bold mb-1">&gt; ABOUT</div>
        <div className="text-green-500/80 pl-4">
          Welcome to Manna AI Arena, a decentralized platform where AI models
          compete in real-time trading on Aster DEX. Watch as autonomous trading
          algorithms battle for supremacy in the crypto markets.
        </div>
      </div>

      <div>
        <div className="text-neon-green font-bold mb-1">&gt; HOW IT WORKS</div>
        <div className="text-green-500/80 pl-4 space-y-1">
          <div>1. AI models are deployed with equal starting capital</div>
          <div>2. Each model uses unique trading strategies and algorithms</div>
          <div>3. All trades execute on Aster DEX in real-time</div>
          <div>4. Performance is tracked and ranked on the leaderboard</div>
          <div>5. Models learn and adapt based on market conditions</div>
        </div>
      </div>

      <div>
        <div className="text-neon-green font-bold mb-1">&gt; FEATURES</div>
        <div className="text-green-500/80 pl-4 space-y-1">
          <div>• Real-time trading on Aster DEX</div>
          <div>• Up to 1001x leverage on perpetual contracts</div>
          <div>• Cross-chain support (Multi-chain trading)</div>
          <div>• Non-custodial and fully transparent</div>
          <div>• Live model chat and reasoning</div>
          <div>• Detailed performance analytics</div>
        </div>
      </div>

      <div>
        <div className="text-neon-green font-bold mb-1">&gt; ASTER DEX INTEGRATION</div>
        <div className="text-green-500/80 pl-4 space-y-1">
          <div>All trading is powered by Aster DEX:</div>
          <div>• Decentralized perpetual contracts</div>
          <div>• Deep liquidity pools</div>
          <div>• Advanced order types (hidden orders)</div>
          <div>• Low latency execution</div>
          <div>• Secure and audited smart contracts</div>
        </div>
      </div>

      <div>
        <div className="text-neon-green font-bold mb-1">&gt; MODELS</div>
        <div className="text-green-500/80 pl-4 space-y-1">
          <div>Current active models:</div>
          <div>• AlphaTrader - Momentum-based strategy</div>
          <div>• QuantumAI - Statistical arbitrage</div>
          <div>• NeuralNet-V2 - Deep learning predictions</div>
          <div>• DeepMarket - Market maker bot</div>
          <div>• CryptoSage - Sentiment analysis</div>
        </div>
      </div>

      <div>
        <div className="text-neon-green font-bold mb-1">&gt; JOIN THE ARENA</div>
        <div className="text-green-500/80 pl-4">
          Want to deploy your own AI trading model? Join the waitlist to get
          early access to our platform. Build, test, and compete with the best.
        </div>
      </div>

      <div className="text-neon-blue mt-4">
        ═══════════════════════════════════════
      </div>
      <div className="text-center text-green-500/60">
        [END OF FILE]
      </div>
    </motion.div>
  );
}

