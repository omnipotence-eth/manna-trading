import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-000)] text-[var(--text-100)]">
      <SiteHeader active="portfolio" showBadges={false} />
      
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-300)] hover:text-[var(--accent)] transition-colors"
          >
            <span>←</span> Back to Portfolio
          </Link>
        </div>

        <article className="prose prose-invert max-w-none">
          <header className="mb-12">
            <h1 className="text-5xl sm:text-6xl font-semibold leading-tight mb-4">
              Manna LLM Aster Crypto Trader
            </h1>
            <p className="text-xl text-[var(--text-300)] mb-2">
              Technical Whitepaper v7.0.0
            </p>
            <p className="text-sm text-[var(--text-400)]">
              Architecture, Risk Philosophy, Agent Design, Data Flows, and Execution Controls
            </p>
          </header>

          <div className="space-y-12">
            {/* Executive Summary */}
            <section>
              <h2 className="text-3xl font-semibold mb-4">Executive Summary</h2>
              <p className="text-[var(--text-200)] leading-relaxed mb-4">
                Manna is an autonomous cryptocurrency trading system that leverages a multi-agent AI framework 
                powered by DeepSeek R1 to analyze markets and execute simulated trades on Aster DEX. The system combines 
                mathematical precision with real-time data aggregation, machine learning, and risk management 
                to create a self-improving trading ecosystem. By default, the system runs in simulation mode using 
                real market data without risking actual funds.
              </p>
              <p className="text-[var(--text-200)] leading-relaxed">
                This whitepaper outlines the technical architecture, agent design, risk management philosophy, data flows, 
                and execution controls that power the Manna trading system.
              </p>
            </section>

            {/* System Architecture */}
            <section>
              <h2 className="text-3xl font-semibold mb-4">System Architecture</h2>
              
              <h3 className="text-2xl font-semibold mb-3 mt-6">Tech Stack</h3>
              <div className="bg-[var(--bg-100)] rounded-lg p-6 border border-[var(--border-200)] mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-200)]">
                      <th className="text-left py-2 px-4">Layer</th>
                      <th className="text-left py-2 px-4">Technology</th>
                      <th className="text-left py-2 px-4">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[var(--border-200)]">
                      <td className="py-2 px-4">Frontend</td>
                      <td className="py-2 px-4">React 18 + Next.js 14</td>
                      <td className="py-2 px-4">Dashboard UI</td>
                    </tr>
                    <tr className="border-b border-[var(--border-200)]">
                      <td className="py-2 px-4">Styling</td>
                      <td className="py-2 px-4">Tailwind CSS + Framer Motion</td>
                      <td className="py-2 px-4">Design system</td>
                    </tr>
                    <tr className="border-b border-[var(--border-200)]">
                      <td className="py-2 px-4">State</td>
                      <td className="py-2 px-4">Zustand</td>
                      <td className="py-2 px-4">Client state management</td>
                    </tr>
                    <tr className="border-b border-[var(--border-200)]">
                      <td className="py-2 px-4">API</td>
                      <td className="py-2 px-4">Next.js API Routes</td>
                      <td className="py-2 px-4">REST endpoints</td>
                    </tr>
                    <tr className="border-b border-[var(--border-200)]">
                      <td className="py-2 px-4">AI</td>
                      <td className="py-2 px-4">DeepSeek R1 via Groq (cloud) or Ollama (local)</td>
                      <td className="py-2 px-4">Decision making</td>
                    </tr>
                    <tr className="border-b border-[var(--border-200)]">
                      <td className="py-2 px-4">Database</td>
                      <td className="py-2 px-4">PostgreSQL (Supabase)</td>
                      <td className="py-2 px-4">Persistence</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4">Real-time</td>
                      <td className="py-2 px-4">WebSocket (ws)</td>
                      <td className="py-2 px-4">Market data</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-2xl font-semibold mb-3 mt-6">Service Layer</h3>
              <p className="text-[var(--text-200)] leading-relaxed mb-4">
                The system is built on a microservices-inspired architecture within a Next.js 14 monolith. This provides 
                the benefits of service isolation while maintaining the simplicity of a single deployable unit.
              </p>
              <div className="bg-[var(--bg-100)] rounded-lg p-6 border border-[var(--border-200)]">
                <ul className="space-y-2 text-sm font-mono">
                  <li>• <span className="text-[var(--accent)]">agentCoordinator.ts</span> - Multi-agent workflow orchestration</li>
                  <li>• <span className="text-[var(--accent)]">agentRunnerService.ts</span> - 24/7 trading loop</li>
                  <li>• <span className="text-[var(--accent)]">positionMonitorService.ts</span> - Position management</li>
                  <li>• <span className="text-[var(--accent)]">marketScannerService.ts</span> - Opportunity detection</li>
                  <li>• <span className="text-[var(--accent)]">asterDexService.ts</span> - Exchange API wrapper</li>
                  <li>• <span className="text-[var(--accent)]">deepseekService.ts</span> - AI model integration</li>
                  <li>• <span className="text-[var(--accent)]">unifiedDataAggregator.ts</span> - Real-time data streams</li>
                  <li>• <span className="text-[var(--accent)]">mlDataCollector.ts</span> - ML training pipeline</li>
                  <li>• <span className="text-[var(--accent)]">rlParameterOptimizer.ts</span> - Reinforcement learning</li>
                  <li>• <span className="text-[var(--accent)]">performanceTracker.ts</span> - Analytics</li>
                </ul>
              </div>
            </section>

            {/* Multi-Agent System */}
            <section>
              <h2 className="text-3xl font-semibold mb-4">Multi-Agent AI System</h2>
              <p className="text-[var(--text-200)] leading-relaxed mb-6">
                Manna employs a four-agent architecture where each agent specializes in a specific aspect of trading. 
                All agents use DeepSeek R1 via Groq (cloud API, default) or Ollama (local GPU), providing reasoning capabilities while maintaining 
                fast response times.
              </p>

              <div className="space-y-6">
                <div className="bg-[var(--bg-100)] rounded-lg p-6 border border-[var(--border-200)]">
                  <h4 className="text-xl font-semibold mb-2 text-[var(--accent)]">Technical Analyst</h4>
                  <p className="text-[var(--text-200)] mb-3">
                    Analyzes chart patterns, volume analysis, and multi-timeframe confluence to identify trading opportunities.
                  </p>
                  <ul className="text-sm text-[var(--text-300)] space-y-1">
                    <li>• Chart pattern recognition</li>
                    <li>• Volume profile analysis</li>
                    <li>• Multi-timeframe confirmation</li>
                    <li>• Technical indicator synthesis</li>
                  </ul>
                </div>

                <div className="bg-[var(--bg-100)] rounded-lg p-6 border border-[var(--border-200)]">
                  <h4 className="text-xl font-semibold mb-2 text-[var(--accent)]">Chief Analyst</h4>
                  <p className="text-[var(--text-200)] mb-3">
                    Synthesizes data from Technical Analyst and makes final BUY/SELL/HOLD decisions with confidence scoring.
                  </p>
                  <ul className="text-sm text-[var(--text-300)] space-y-1">
                    <li>• Decision synthesis</li>
                    <li>• Confidence calculation</li>
                    <li>• Risk-reward assessment</li>
                    <li>• Market context integration</li>
                  </ul>
                </div>

                <div className="bg-[var(--bg-100)] rounded-lg p-6 border border-[var(--border-200)]">
                  <h4 className="text-xl font-semibold mb-2 text-[var(--accent)]">Risk Manager</h4>
                  <p className="text-[var(--text-200)] mb-3">
                    Applies Kelly Criterion for position sizing, ATR-based stop-loss, and portfolio risk limits.
                  </p>
                  <ul className="text-sm text-[var(--text-300)] space-y-1">
                    <li>• Kelly Criterion position sizing</li>
                    <li>• ATR-based stop-loss calculation</li>
                    <li>• Portfolio risk limits (max 10% per position)</li>
                    <li>• Maximum concurrent positions (2)</li>
                    <li>• Chandelier Exit trailing stops</li>
                  </ul>
                </div>

                <div className="bg-[var(--bg-100)] rounded-lg p-6 border border-[var(--border-200)]">
                  <h4 className="text-xl font-semibold mb-2 text-[var(--accent)]">Execution Specialist</h4>
                  <p className="text-[var(--text-200)] mb-3">
                    Determines optimal order timing, slippage protection, and execution parameters.
                  </p>
                  <ul className="text-sm text-[var(--text-300)] space-y-1">
                    <li>• Optimal entry timing</li>
                    <li>• Slippage protection</li>
                    <li>• Order type selection</li>
                    <li>• Execution validation</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Risk Management Philosophy */}
            <section>
              <h2 className="text-3xl font-semibold mb-4">Risk Management Philosophy</h2>
              
              <h3 className="text-2xl font-semibold mb-3 mt-6">Core Principles</h3>
              <div className="bg-[var(--bg-100)] rounded-lg p-6 border border-[var(--border-200)] mb-6">
                <ol className="space-y-4 text-[var(--text-200)]">
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">1.</span>
                    <div>
                      <strong>Capital Preservation:</strong> Maximum 10% of portfolio per position, maximum 2 concurrent positions
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">2.</span>
                    <div>
                      <strong>Mathematical Precision:</strong> Kelly Criterion for optimal position sizing based on win rate and risk-reward
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">3.</span>
                    <div>
                      <strong>Dynamic Stops:</strong> ATR-based stop-loss (3% default) and Chandelier Exit trailing stops
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">4.</span>
                    <div>
                      <strong>Confidence Thresholds:</strong> Minimum 70% confidence required for trade execution
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">5.</span>
                    <div>
                      <strong>Continuous Monitoring:</strong> Real-time position monitoring with automatic stop-loss and take-profit execution
                    </div>
                  </li>
                </ol>
              </div>

              <h3 className="text-2xl font-semibold mb-3 mt-6">Risk Metrics</h3>
              <p className="text-[var(--text-200)] leading-relaxed mb-4">
                The system tracks comprehensive risk metrics including Sharpe Ratio, Sortino Ratio, Maximum Drawdown, 
                and Win Rate to continuously assess and improve performance.
              </p>
            </section>

            {/* Data Flow */}
            <section>
              <h2 className="text-3xl font-semibold mb-4">Data Flow & Execution Pipeline</h2>
              
              <div className="bg-[var(--bg-100)] rounded-lg p-6 border border-[var(--border-200)] mb-6">
                <h3 className="text-xl font-semibold mb-4">Trading Cycle (Every 60 seconds)</h3>
                <ol className="space-y-3 text-sm text-[var(--text-200)]">
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">1.</span>
                    <span><strong>Market Scanner:</strong> Scans top 100 symbols by volume, calculates opportunity scores, filters by volume/spread/liquidity</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">2.</span>
                    <span><strong>Workflow Creation:</strong> Creates trading workflow for each opportunity</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">3.</span>
                    <span><strong>Data Gathering:</strong> Fetches real-time market data, order book, funding rates</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">4.</span>
                    <span><strong>Technical Analysis:</strong> Technical Analyst analyzes market data and provides recommendation</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">5.</span>
                    <span><strong>Chief Decision:</strong> Chief Analyst makes final BUY/SELL/HOLD decision with confidence</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">6.</span>
                    <span><strong>Risk Assessment:</strong> Risk Manager validates confidence threshold, account balance, position limits</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">7.</span>
                    <span><strong>Execution Planning:</strong> Execution Specialist determines optimal entry timing and parameters</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">8.</span>
                    <span><strong>Trade Execution:</strong> Places order on Aster DEX with validation and error handling</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[var(--accent)] font-semibold">9.</span>
                    <span><strong>Position Monitoring:</strong> Continuous monitoring with stop-loss and take-profit management</span>
                  </li>
                </ol>
              </div>

              <h3 className="text-2xl font-semibold mb-3 mt-6">Real-Time Data Sources</h3>
              <ul className="space-y-2 text-[var(--text-200)]">
                <li>• WebSocket streams for all tickers, order book depth, mark prices</li>
                <li>• Funding rate analysis for sentiment detection</li>
                <li>• Liquidation monitoring for long/short squeeze detection</li>
                <li>• Multi-timeframe price data aggregation</li>
              </ul>
            </section>

            {/* Machine Learning */}
            <section>
              <h2 className="text-3xl font-semibold mb-4">Machine Learning & Continuous Improvement</h2>
              <p className="text-[var(--text-200)] leading-relaxed mb-4">
                The system continuously learns from trade outcomes to improve decision-making:
              </p>
              <ul className="space-y-2 text-[var(--text-200)]">
                <li>• <strong>ML Data Collection:</strong> All trade outcomes, agent decisions, and market conditions are logged</li>
                <li>• <strong>Pattern Recognition:</strong> Identifies successful trading patterns and market conditions</li>
                <li>• <strong>Feature Importance:</strong> Analyzes which factors contribute most to successful trades</li>
                <li>• <strong>Reinforcement Learning:</strong> Optimizes parameters based on historical performance</li>
                <li>• <strong>Monte Carlo Simulations:</strong> Tests strategies under various market conditions</li>
              </ul>
            </section>

            {/* Security & Reliability */}
            <section>
              <h2 className="text-3xl font-semibold mb-4">Security & Reliability</h2>
              <div className="space-y-4 text-[var(--text-200)]">
                <div>
                  <h3 className="text-xl font-semibold mb-2">API Key Management</h3>
                  <p>30-key rotation system with automatic failover, server time synchronization, and comprehensive error handling.</p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Error Handling</h3>
                  <p>Circuit breaker pattern, retry mechanisms with exponential backoff, and graceful degradation.</p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Data Validation</h3>
                  <p>Comprehensive validation at every step to ensure data integrity and prevent invalid trades.</p>
                </div>
              </div>
            </section>

            {/* Conclusion */}
            <section>
              <h2 className="text-3xl font-semibold mb-4">Conclusion</h2>
              <p className="text-[var(--text-200)] leading-relaxed mb-4">
                Manna represents a sophisticated approach to autonomous cryptocurrency trading, combining the reasoning 
                capabilities of DeepSeek R1 with mathematical precision, real-time data aggregation, and continuous 
                learning. The multi-agent architecture ensures that each aspect of trading is handled by a specialized 
                agent, while the comprehensive risk management framework protects capital and optimizes returns.
              </p>
              <p className="text-[var(--text-200)] leading-relaxed">
                The system is designed to be transparent, auditable, and continuously improving, providing a solid 
                foundation for autonomous trading operations.
              </p>
            </section>
          </div>

          <footer className="mt-16 pt-8 border-t border-[var(--border-200)]">
            <p className="text-sm text-[var(--text-400)]">
              Manna LLM Aster Crypto Trader v7.0.0 • Technical Whitepaper
            </p>
            <p className="text-xs text-[var(--text-500)] mt-2">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}

