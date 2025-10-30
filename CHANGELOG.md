# Changelog

All notable changes to the Manna AI Trading Bot project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **DeepSeek R1 Migration** - All AI agents now use DeepSeek R1 32B with Chain-of-Thought
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

**All glory to God!** 🙏

