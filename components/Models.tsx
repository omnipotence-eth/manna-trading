'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface AIModel {
  name: string;
  description: string;
  strategy: string;
  status: 'active' | 'training' | 'paused';
  performance: number;
  trades: number;
}

export default function Models() {
  const [models] = useState<AIModel[]>([
           {
             name: 'DeepSeek R1',
             description: 'Advanced reasoning model that analyzes BTC, ETH, SOL, ASTER, and ZEC markets. Uses deep multi-step logic to identify the best trading opportunities across multiple pairs with adaptive risk management.',
             strategy: 'Deep Reasoning + Multi-Market Analysis',
             status: 'active',
             performance: 0,
             trades: 0,
           },
  ]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold terminal-text mb-2">AI MODELS</h1>
        <p className="text-green-500/60 text-sm">
          Currently running: DeepSeek R1 with $100 starting capital • Trading on Aster DEX
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {models.map((model, index) => (
          <motion.div
            key={model.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-effect p-6 rounded-lg hover:border-green-500/60 transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-neon-green mb-1">{model.name}</h3>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs border ${
                      model.status === 'active'
                        ? 'border-neon-green text-neon-green'
                        : model.status === 'training'
                        ? 'border-yellow-500 text-yellow-500'
                        : 'border-red-500 text-red-500'
                    }`}
                  >
                    {model.status.toUpperCase()}
                  </span>
                </div>
              </div>
              {model.status === 'active' && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-neon-green">
                    +{model.performance}%
                  </div>
                  <div className="text-xs text-green-500/60">{model.trades} trades</div>
                </div>
              )}
            </div>

            <p className="text-green-500/80 text-sm mb-4">{model.description}</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-500/60">Strategy:</span>
                <span className="text-neon-blue">{model.strategy}</span>
              </div>

              {model.status === 'active' && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-500/60">Risk Level:</span>
                    <span className="text-yellow-500">MEDIUM</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-500/60">Max Leverage:</span>
                    <span className="text-green-500">10x</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-green-500/30 flex gap-2">
              <button className="flex-1 px-4 py-2 border border-green-500 text-green-500 hover:bg-green-500/10 transition-all text-sm">
                VIEW DETAILS
              </button>
              {model.status === 'active' && (
                <button className="flex-1 px-4 py-2 border border-neon-blue text-neon-blue hover:bg-neon-blue/10 transition-all text-sm">
                  WATCH LIVE
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-effect p-8 rounded-lg"
      >
        <h2 className="text-2xl font-bold terminal-text mb-4 text-center">
          MORE MODELS COMING SOON
        </h2>
        <p className="text-green-500/80 mb-6 max-w-2xl mx-auto text-center">
          Additional AI trading models are in development and will be deployed after DeepSeek R1 completes its initial testing phase.
          Future models include AlphaTrader, QuantumAI, NeuralNet-V2, and more.
        </p>
        <div className="text-sm text-green-500/60 text-center">
          📋 <a href="/docs/AI_MODELS_REFERENCE.md" className="text-neon-blue hover:underline">View Full Model Documentation</a>
        </div>
      </motion.div>
    </div>
  );
}

