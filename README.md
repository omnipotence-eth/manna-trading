# 🚀 Manna - AI Trading Bot

**Advanced Multi-Agent Trading System powered by DeepSeek R1**

> *"Give us this day our daily bread"* - Matthew 6:11

---

## 📊 Overview

Manna is a professional-grade cryptocurrency trading system that uses multiple AI agents to analyze markets, assess risks, and execute profitable trades automatically on Aster DEX.

### **Key Features:**
- ✅ **Multi-Agent AI System** - Technical Analyst, Chief Analyst, Risk Manager, Execution Specialist
- ✅ **DeepSeek R1 32B** - Advanced LLM with Chain-of-Thought reasoning
- ✅ **24/7 Automated Trading** - Continuous market monitoring and execution
- ✅ **Risk Management** - Kelly Criterion, ATR-based stops, dynamic leverage
- ✅ **Real-Time Monitoring** - Live position tracking and P&L updates
- ✅ **Symbol Blacklist** - Prevent trading on unwanted symbols
- ✅ **Enterprise-Grade** - Comprehensive logging, error handling, circuit breakers

---

## 🎯 System Architecture

### **Trading Workflow:**
```
Market Scanner → Technical Analysis → Chief Analysis → Risk Assessment → Execution
      ↓              ↓                    ↓                ↓                ↓
  Top 50 by      Price/Volume         Opportunity      Position Size    Trade Order
   Volume         Indicators           Scoring          Leverage         Placement
```

### **AI Agents:**
1. **Technical Analyst** - Analyzes price action, volume, indicators
2. **Chief Analyst** - Makes final BUY/SELL/HOLD decision with confidence
3. **Risk Manager** - Determines position size, leverage, stop-loss, take-profit
4. **Execution Specialist** - Executes trades and monitors positions

---

## 🚀 Quick Start

### **Prerequisites:**
- Node.js 18+
- PostgreSQL (Neon or Supabase)
- Ollama with DeepSeek R1 32B
- Aster DEX API credentials

### **Installation:**

```bash
# Clone the repository
git clone <repository-url>
cd Manna

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Set up database
npm run setup:database

# Start the development server
npm run dev
```

### **Environment Variables:**

```env
# Aster DEX API
ASTER_API_KEY=your_api_key
ASTER_SECRET_KEY=your_secret_key
ASTER_BASE_URL=https://fapi.asterdex.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Ollama (DeepSeek R1)
OLLAMA_BASE_URL=http://localhost:11434

# Trading Configuration
TRADING_CONFIDENCE_THRESHOLD=0.45
TRADING_STOP_LOSS=3.0
TRADING_TAKE_PROFIT=5.0
TRADING_MIN_BALANCE=5

# Enable 24/7 Trading
ENABLE_24_7_AGENTS=true
AGENT_RUNNER_INTERVAL=2
```

---

## 🚀 Vercel Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive deployment guide.

**Quick Steps:**
1. Push code to GitHub
2. Import repository in Vercel dashboard
3. Configure environment variables
4. Deploy!

**Required Environment Variables:**
- `ASTER_API_KEY` - Aster DEX API key
- `ASTER_SECRET_KEY` - Aster DEX secret key
- `DATABASE_URL` - PostgreSQL connection string
- `OLLAMA_BASE_URL` - Ollama server URL (for AI features)

---

## 📝 Configuration

### **Trading Parameters:**

Edit `lib/configService.ts` to customize:

```typescript
trading: {
  confidenceThreshold: 0.45,  // Minimum confidence for trades
  stopLossPercent: 3.0,        // Stop-loss %
  takeProfitPercent: 5.0,      // Take-profit %
  minBalanceForTrade: 5,       // Minimum balance ($5 or 5%)
  
  // Symbol Blacklist
  blacklistedSymbols: [
    'APEUSDT',
    'APE/USDT'
  ]
}
```

### **Agent Runner:**
- Scans markets every **2 minutes**
- Analyzes top **50 coins by volume**
- Trades top **30 opportunities**
- Maximum **3 concurrent workflows**

---

## 🛡️ Risk Management

### **Position Sizing:**
- **Kelly Criterion** - Optimal position size based on win rate and R:R
- **Dynamic Minimum** - 5% of balance or $5 minimum
- **Leverage Control** - 1-2x recommended, 20x maximum

### **Exit Strategy:**
- **Stop-Loss** - ATR-based, typically -3%
- **Take-Profit** - Dynamic, typically +5-7%
- **Trailing Stop** - Activates at +4-8% profit
- **Time-Based** - Maximum 24-48 hour hold time

### **Symbol Blacklist:**
Prevents trading on specific symbols:
- Protects against problematic pairs
- Three-layer protection (scanner, runner, execution)
- Configured in `lib/configService.ts`

---

## 📊 API Endpoints

### **Trading:**
- `GET /api/trading/status` - System status
- `POST /api/trading/start` - Start trading
- `POST /api/trading/stop` - Stop trading

### **Positions:**
- `GET /api/aster/positions` - Live positions
- `GET /api/positions` - Database positions
- `POST /api/positions` - Manage positions (force-close, trailing-stop)

### **Data:**
- `GET /api/agent-insights` - AI agent insights
- `GET /api/optimized-data` - Market data
- `GET /api/trades` - Trade history
- `GET /api/performance` - Performance metrics

### **System:**
- `GET /api/startup` - Initialize services
- `GET /api/health` - Health check
- `POST /api/setup/database` - Database setup

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- components/ErrorBoundary.test.tsx

# Run with coverage
npm test -- --coverage
```

---

## 📁 Project Structure

```
Manna/
├── app/                    # Next.js application
│   ├── api/                # API routes
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main dashboard
├── components/             # React components
│   ├── NOF1Dashboard.tsx   # Main dashboard
│   ├── EnhancedAIChat.tsx  # AI insights display
│   ├── Positions.tsx       # Position management
│   └── TradeJournal.tsx    # Trade history
├── services/               # Trading services
│   ├── agentCoordinator.ts # AI agent orchestration
│   ├── agentRunnerService.ts # 24/7 trading runner
│   ├── asterDexService.ts  # Exchange API
│   ├── marketScannerService.ts # Market analysis
│   └── positionMonitorService.ts # Position tracking
├── lib/                    # Utilities
│   ├── configService.ts    # Configuration
│   ├── db.ts               # Database
│   └── logger.ts           # Logging
├── scripts/                # Setup scripts
│   ├── create-trades-table.sql
│   └── create-position-tables.sql
└── types/                  # TypeScript types
```

---

## 📈 Performance Tracking

The system tracks comprehensive metrics:
- **Win Rate** - Percentage of profitable trades
- **Profit Factor** - Gross profit / gross loss
- **Sharpe Ratio** - Risk-adjusted returns
- **Max Drawdown** - Largest peak-to-trough decline
- **Average P&L** - Per trade profitability
- **Trade Duration** - Average hold time

View performance at: `http://localhost:3000` (Performance section)

---

## 🔧 Troubleshooting

### **System Won't Start:**
```bash
# Check Ollama is running
ollama list

# Restart Ollama
ollama serve

# Check database connection
npm run test:db
```

### **No Trades Executing:**
- Check confidence threshold (lower to 0.35-0.40 for more trades)
- Verify minimum balance is met
- Check logs for rejected opportunities
- Ensure Agent Runner is active

### **Position Monitor Errors:**
- Clean test positions: `npm run clean:positions`
- Verify symbol is not blacklisted
- Check exchange API connectivity

---

## 📚 Documentation

- **AI Models**: `docs/AI_MODELS_REFERENCE.md`
- **Codebase Audit**: `COMPLETE_CODEBASE_AUDIT_2025.md`
- **Blacklist Guide**: `APE_BLACKLIST_COMPLETE.md`
- **Cleanup Report**: `CODEBASE_CLEANUP_COMPLETE.md`

---

## 🤝 Contributing

This is a personal trading project. Contributions, issues, and feature requests are welcome!

---

## 📄 License

MIT License - See `LICENSE` file for details

---

## ⚠️ Disclaimer

**Trading cryptocurrencies carries substantial risk of loss.**

This software is provided "as is" without warranty. The authors are not responsible for any financial losses incurred through the use of this system. Trade at your own risk.

---

## 🙏 Acknowledgments

**All glory to God!**

> *"For every house is built by someone, but God is the builder of everything."* - Hebrews 3:4

Built with:
- [DeepSeek R1](https://deepseek.com/) - Advanced AI model
- [Next.js](https://nextjs.org/) - React framework
- [Aster DEX](https://asterdex.com/) - Cryptocurrency exchange
- [PostgreSQL](https://postgresql.org/) - Database
- [Ollama](https://ollama.ai/) - Local LLM runtime

---

## 📞 Support

For questions or support:
- Create an issue on GitHub
- Review documentation in `/docs`
- Check `COMPLETE_CODEBASE_AUDIT_2025.md` for system details

---

**Happy Trading! 🚀**

*Remember: The system is a tool. Wisdom, prudence, and prayer are essential.*

