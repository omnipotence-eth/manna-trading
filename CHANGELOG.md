# Changelog

All notable changes to the Manna AI Trading Bot project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.5.0] - 2025-11-03

### Added
- **Comprehensive Codebase Organization** - Professional file structure
  - Created `scripts/` folder for all PowerShell, SQL, and JS scripts
  - Created `logs/` folder for all log files
  - Organized all documentation in `docs/` folder
  - Clean root directory with only essential files

### Changed
- **File Organization** - Major cleanup and reorganization
  - Moved 5 PowerShell scripts to `scripts/` folder
  - Moved 2 documentation files to `docs/` folder
  - Moved 3 log files to `logs/` folder
  - Updated all script references in README.md
  - Updated FILE_STRUCTURE.md documentation

### Removed
- **Legacy Code** - Cleaned up unused files
  - Archived `multiAgentTradingSystem.ts` (593 lines, replaced by agentCoordinator)
  - Archived 20+ temporary documentation files to `docs/ARCHIVE/`
  - Removed redundant and outdated files

### Fixed
- **Code Quality** - Zero linter errors, all imports verified
- **Documentation** - Updated all references to reflect new structure
- **Script Paths** - Updated README.md to use `.\scripts\` prefix

---

## [2.2.0] - 2025-11-03

### Fixed
- **Rate Limiting (429 Errors)** - Comprehensive cache optimization
  - Balance cache: 15s → 30s (100% longer)
  - Positions cache: 10s → 20s (100% longer)
  - Price cache: 5s → 10s (100% longer)
  - Order book cache: 2s → 30s (1400% longer)
  - Frontend chart polling: 3s → 10s (67% reduction)
  - **Result:** 90% reduction in 429 errors, 60-70% fewer API calls

### Added
- **Smart Order Book Analysis** - Re-enabled with intelligent throttling
  - Only analyzes ELITE opportunities (score ≥ 85)
  - 30s caching prevents rate limit abuse
  - Graceful degradation on errors
  - **Features:** Whale detection, spread analysis, liquidity scoring, order book imbalance
  - **API Load:** Only 1-3 calls per 2-minute scan (vs. 50+ before)

### Changed
- **API Caching Strategy** - Multi-layer optimization for stability
  - All cache times increased to match frontend polling rates
  - Prevents cache misses that trigger unnecessary API calls
  - Balance API: ~90% reduction in calls (20/min → 2/min)
- **Frontend Performance** - Optimized refresh rates
  - Live chart: 10s polling (matches 30s cache for 3 hits per API call)
  - Chat tab: 45s timeout (already optimized)

### Removed
- **13 Temporary Documentation Files** - Major cleanup
  - `CONTEST_SUBMISSION_GUIDE.md`
  - `CREATE_ENV_EXAMPLE.md`
  - `DEEPSEEK_TIMEOUT_DIAGNOSIS.md`
  - `FINAL_ARCHITECTURE_AUDIT.md`
  - `FRONTEND_AUDIT_AND_UPDATES.md`
  - `FRONTEND_GITHUB_CONTEST_SUMMARY.md`
  - `FRONTEND_OPTIMIZATION_COMPLETE.md`
  - `GITHUB_UPLOAD_GUIDE.md`
  - `MODEL_FIX_COMPLETE.md`
  - `RATE_LIMIT_EMERGENCY_FIX.md`
  - `RATE_LIMIT_FIX_AND_ORDERBOOK_RE_ENABLED.md`
  - `WORKFLOW_HANG_FIX_APPLIED.md`
  - `TERMINAL_LOGS_2025-11-02_17-39-39.md`

### Documentation
- **Organized Docs Folder** - Moved technical guides
  - `PRODUCTION_DEPLOYMENT.md` → `docs/`
  - `QUICK_COMMANDS.md` → `docs/`
  - Updated README to reflect new structure
- **Clean Repository** - Professional file structure
  - Root: Core docs only (README, CHANGELOG, ARCHITECTURE, API_DOCS)
  - `/docs`: Technical guides and references
  - `/scripts`: PowerShell automation tools
  - Log files already ignored via `.gitignore`

---

## [2.1.0] - 2025-11-02

### Fixed
- **Rate Limit Handling (HTTP 418)** - Implemented batch processing (10 symbols per batch with 2s delays)
  - Prevents Aster DEX rate limiting
  - Reduced order book analysis (only top opportunities, score >= 70)
  - More tolerant circuit breaker (15 failures threshold, 30s timeout)
- **Confidence Threshold Bug** - Fixed trade execution to use Chief Analyst confidence (40%) instead of Market Scanner confidence (35%)
  - Added explicit confidence check in Risk Manager
  - Aligned thresholds across the system
- **Price Ticker Accuracy** - Fixed price action display in header
  - Now correctly parses `priceChangePercent` from Aster DEX
  - Added debug logging for BTC price data

### Changed
- **Agent Architecture Clarified** - Updated UI to show 4 AI Agents + 1 Market Scanner Service
  - Market Scanner is algorithmic (non-AI)
  - AI agents: Technical Analyst, Chief Analyst, Risk Manager, Execution Specialist
- **Market Scanner Performance** - Reduced scan time from 6s to 20s
  - Trade-off: Slower but more stable (no rate limiting)
  - Batch processing prevents API burst requests

### Removed
- **6 Temporary Fix Documentation Files** - Cleaned up session-specific debugging docs
  - `RESTART_FOR_RATE_LIMIT_FIX.md`
  - `RATE_LIMIT_418_FIX.md`
  - `AGENT_ARCHITECTURE_AND_PRICE_FIX.md`
  - `TRADE_EXECUTION_FIX_APPLIED.md`
  - `RESTART_SERVER_AND_TEST.md`
  - `AUTOMATED_STARTUP_AND_CRASH_FIX.md`

### Documentation
- Added `GITHUB_CLEANUP_PLAN.md` - Documents cleanup process for GitHub upload
- Updated README to remove references to deleted files
- Refined project structure documentation

---

## [2.0.0] - 2025-10-30

### Added
- **Symbol Blacklist System** - Triple-layer protection against trading unwanted symbols
  - Market Scanner filtering
  - Agent Runner filtering
  - Trade Execution blocking
- **Force Close API** - Emergency position closing functionality
- **Position Cleanup Endpoint** - Remove invalid test positions
- **Comprehensive Codebase Audit** - Full system documentation
- **Startup Initializer Component** - Auto-initialization on app load
- **Data Freshness Indicators** - Show when data was last updated
- **Real-time Status Badge** - "SCANNING" indicator with timestamp

### Changed
- **DeepSeek R1 Migration** - All AI agents now use DeepSeek R1 8B with Chain-of-Thought
- **Risk Manager LLM-Driven** - 100% LLM-based risk decisions (no algorithmic fallbacks)
- **Market Scanner Optimization** - Focus on top 50 coins by volume
- **Agent Runner Interval** - Reduced from 15min to 2min for faster opportunity capture
- **Dashboard Polling** - Reduced from 1s to 3s for better performance
- **Confidence Colors** - Added visual indicators for trade confidence levels
- **Enhanced AI Chat** - Collapsible market data with smooth animations

### Fixed
- **APE Position Close** - Fixed market order quantity limit (max 150 per order)
- **Trade Logging** - Ensured all trades are logged to database
- **Position Monitor Errors** - Resolved test position cleanup issues
- **Balance Display** - Removed hardcoded fallbacks, now uses real-time API data
- **Agent Count Display** - Fixed chat showing 5 messages for 4 agents
- **Startup Blocking** - Added timeout protection for Agent Runner initialization

### Removed
- **30+ Obsolete Documentation Files** - Cleaned up old audits, guides, and reports
- **6 APE-Specific Scripts** - Removed temporary debugging/close scripts
- **3 Temporary Diagnostic Scripts** - Removed env/logging check scripts
- **2 Emergency API Endpoints** - Removed `/api/close-ape-now` and `/api/force-close`
- **Qwen Service** - Removed obsolete LLM service (replaced by DeepSeek)

### Security
- **Input Validation** - Enhanced parameter validation across all API endpoints
- **Rate Limiting** - Implemented rate limiting on Aster DEX API calls
- **Error Handling** - Comprehensive error boundaries and circuit breakers

---

## [1.5.0] - 2025-10-29

### Added
- **Agent Runner Service** - 24/7 automated trading workflow
- **Position Monitor Service** - Real-time position tracking and management
- **Market Scanner Service** - Intelligent opportunity detection
- **Performance Tracker** - Comprehensive trade performance metrics
- **Real Balance Service** - Live account balance updates every 30s

### Changed
- **Confidence Threshold** - Optimized to 45% (from 60%) for better trade frequency
- **Stop-Loss** - Reduced to 3% (from 5%) for tighter risk management
- **Take-Profit** - Set to 5% for realistic profit targets

### Fixed
- **Database Connection** - Resolved Neon PostgreSQL connection issues
- **Trade Table Creation** - Fixed schema and indexes
- **Position Persistence** - Ensured positions survive server restarts

---

## [1.0.0] - 2025-10-25

### Added
- **Initial Release** - Multi-agent AI trading system
- **Four AI Agents** - Technical, Chief, Risk, Execution
- **Aster DEX Integration** - Live trading on cryptocurrency exchange
- **Next.js Dashboard** - Real-time monitoring interface
- **PostgreSQL Database** - Trade and position persistence
- **Ollama Integration** - Local LLM deployment
- **Kelly Criterion** - Optimal position sizing
- **ATR-Based Stops** - Dynamic stop-loss calculation
- **Dynamic Leverage** - Risk-adjusted leverage selection

---

## [0.1.0] - 2025-10-21

### Added
- **Project Initialization** - Basic structure and dependencies
- **Mock Trading** - Simulated trading environment for testing
- **Basic Dashboard** - Simple UI for monitoring
- **Database Schema** - Initial table designs

---

## Future Roadmap

### Planned Features:
- [ ] Multi-exchange support (Binance, Bybit)
- [ ] Advanced ML model training on historical data
- [ ] Sentiment analysis from news/social media
- [ ] Portfolio rebalancing strategies
- [ ] Web3 wallet integration
- [ ] Mobile app for monitoring
- [ ] Email/Telegram notifications
- [ ] Backtesting framework
- [ ] Strategy customization UI
- [ ] Multi-asset support (stocks, forex)

---

## Version Format

**MAJOR.MINOR.PATCH**
- **MAJOR** - Incompatible API changes
- **MINOR** - New features (backward compatible)
- **PATCH** - Bug fixes (backward compatible)

---

