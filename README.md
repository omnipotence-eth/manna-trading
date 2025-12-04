# 🚀 Manna - AI-Powered Trading System

**Enterprise-grade autonomous trading system powered by DeepSeek R1 AI**

---

## ⚡ Quick Start

### **Prerequisites**

1. **Node.js 18+** - [Download](https://nodejs.org)
2. **Ollama** - [Download](https://ollama.ai)
3. **DeepSeek R1 Model** - Run: `ollama pull deepseek-r1:14b`
4. **Aster DEX API Keys** - [Get from Aster DEX](https://asterdex.com)

### **Installation**

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/manna-trading.git
cd manna-trading

# Install dependencies
npm install

# Copy environment template and configure
cp .env.example .env.local
# Edit .env.local with your API keys
```

### **Starting the System**

```bash
# Start the development server
npm run dev
```

The system **auto-initializes** on startup:
- ✅ Connects to Aster DEX API
- ✅ Initializes AI trading agents
- ✅ Starts 24/7 market scanning
- ✅ Enables position monitoring

### **View Dashboard**

Open [http://localhost:3000](http://localhost:3000) in your browser.

### **Manual Initialization** (if needed)

```bash
# Check system status
curl http://localhost:3000/api/startup?action=status

# Force initialize
curl http://localhost:3000/api/startup?action=initialize
```

---

## 🏗️ Architecture

### **Core Services**
- **Agent Runner**: 24/7 AI-powered trading workflows
- **Health Monitor**: Auto-restart crashed services (checks every 30s)
- **Real Balance Service**: Live account balance tracking
- **Position Monitor**: Real-time position management
- **DeepSeek R1 AI**: Advanced reasoning for trade decisions

### **API Integration**
- **Aster DEX**: Primary exchange (30-key pool, 60 req/sec)
- **PostgreSQL**: Trade history and analytics
- **Ollama**: Local DeepSeek R1 model serving

---

## 🛠️ Configuration

**Environment**: `.env.local`

### **Key Settings**
```bash
# API Keys (30-key pool for high throughput)
ASTER_KEY_POOL={...}
USE_MULTI_KEY_API=true

# Rate Limiting (ultra-conservative for stability)
RATE_LIMIT_PER_KEY_RPS=2    # 60 req/sec total
MAX_CONCURRENT_WORKFLOWS=1   # 1 workflow at a time

# AI Model
DEEPSEEK_MODEL=deepseek-r1:14b

# Database
DATABASE_URL=postgresql://...
```

### **Increasing Performance** (after 1-2 hours stable)

Gradually increase rate limits:
```bash
# Step 1: Increase to 5 RPS
RATE_LIMIT_PER_KEY_RPS=5    # 150 req/sec total

# Step 2 (if stable): Increase to 10 RPS
RATE_LIMIT_PER_KEY_RPS=10   # 300 req/sec total

# Step 3 (if stable): Add concurrent workflows
MAX_CONCURRENT_WORKFLOWS=2
```

**After each change**: Restart server and monitor for 429 errors

---

## 📁 Project Structure

```
Manna/
├── app/                    # Next.js app routes
│   ├── api/               # API endpoints
│   └── page.tsx           # Main dashboard
├── components/            # React components
│   ├── NOF1Dashboard.tsx  # Main dashboard
│   ├── InteractiveChart.tsx
│   └── EnhancedAIChat.tsx
├── services/              # Core trading services
│   ├── agentRunnerService.ts        # 24/7 trading workflows
│   ├── agentCoordinator.ts          # Multi-agent orchestration
│   ├── healthMonitorService.ts      # Auto-restart system
│   ├── asterDexService.ts           # Exchange API
│   ├── deepseekService.ts           # AI model interface
│   ├── realBalanceService.ts        # Balance tracking
│   ├── positionMonitorService.ts    # Position management
│   └── marketScannerService.ts      # Market opportunity scanner
├── lib/                   # Utilities
│   ├── agentPromptsOptimized.ts     # AI prompts
│   ├── apiKeyManager.ts             # 30-key pool management
│   ├── circuitBreaker.ts            # API failure protection
│   └── logger.ts                    # Logging system
├── types/                 # TypeScript type definitions
│   ├── aster.ts               # Aster DEX types
│   └── trading.ts             # Trading types
└── docs/                      # 📚 Documentation
    ├── PRODUCTION_DEPLOYMENT.md     # Deployment guide
    ├── SYSTEM_ARCHITECTURE.md       # Architecture overview
    └── AI_MODELS_REFERENCE.md       # AI model details
```

---

## 🎯 Key Features

### **AI-Powered Trading**
- **DeepSeek R1**: Advanced reasoning model (14B parameters)
- **Multi-Agent System**: Technical Analyst → Chief Analyst → Risk Manager → Execution
- **Market Scanner**: Analyzes 217+ trading pairs
- **Confidence-Based**: Only trades when confidence > 80%

### **Enterprise Reliability**
- **Health Monitoring**: Auto-restart crashed services
- **Circuit Breakers**: API failure protection
- **30-Key Pool**: 600 req/sec capacity (running at 60 req/sec for stability)
- **Request Deduplication**: Prevents duplicate API calls
- **Exponential Backoff**: Automatic retry with delays

### **Risk Management**
- **Kelly Criterion**: Optimal position sizing
- **ATR-Based Stops**: Volatility-adjusted risk
- **Dynamic Leverage**: Market-condition aware
- **Portfolio Limits**: Maximum risk caps
- **Position Monitoring**: Real-time P&L tracking

### **Self-Healing**
- **Never Crashes**: Catch-all error handlers
- **Auto-Restart**: Services recover in 30 seconds
- **Continuous Trading**: 24/7 operation
- **Degraded Mode**: Continues with reduced functionality if needed

---

## 🔧 Troubleshooting

### **Services Not Initializing**

1. Check Ollama is running:
```bash
ollama ps  # Should show deepseek-r1:14b
```

2. Check server logs for errors
3. Verify `.env.local` configuration
4. Check API: `curl http://localhost:3000/api/health`

### **429 Rate Limit Errors**

Reduce rate limits in `.env.local`:
```bash
RATE_LIMIT_PER_KEY_RPS=1    # Ultra-conservative
```

Restart server after changes.

### **Agent Runner Keeps Crashing**

Check logs for root cause:
- **DeepSeek errors**: Check Ollama is running
- **API errors**: Check Aster DEX API status
- **Database errors**: Check DATABASE_URL

Health Monitor will auto-restart, but fix the root cause for stability.

### **No Trades After 30+ Minutes**

This is normal with conservative settings! The system is:
- Analyzing markets continuously
- Waiting for high-confidence opportunities
- Being very selective (>80% confidence)

To see more trades (once stable):
- Increase rate limits gradually
- Wait 1-2 hours for market conditions
- Check AI insights for analysis reasoning

---

## 📈 Monitoring

### **Real-Time Dashboard**
- Live balance chart
- Open positions
- AI agent insights
- Trade history
- Performance metrics

### **Health Status**
```bash
# Check system health
curl http://localhost:3000/api/health

# Check trading status
curl http://localhost:3000/api/trading-status

# Detailed health check
curl http://localhost:3000/api/health/detailed
```

### **Logs**
- Server logs: Check `npm run dev` terminal
- Error logs: Automatic via logger
- Trade logs: Database + dashboard

---

## 🙏 Credits

**In Jesus' name, amen! All glory to God in Heaven!**

Built with:
- Next.js 15
- DeepSeek R1 (via Ollama)
- Aster DEX API
- PostgreSQL
- TypeScript

---

## 📚 Documentation

### **Core Documentation**
- **[System Architecture](SYSTEM_ARCHITECTURE.md)** - Technical architecture and design
- **[API Documentation](API_DOCUMENTATION.md)** - Complete API reference
- **[Changelog](CHANGELOG.md)** - Version history and updates

### **Technical Guides** (in `/docs`)
- **[Production Deployment](docs/PRODUCTION_DEPLOYMENT.md)** - Production deployment guide
- **[Quick Commands](docs/QUICK_COMMANDS.md)** - Command reference guide
- **[AI Models Reference](docs/AI_MODELS_REFERENCE.md)** - AI model documentation
- **[File Structure](docs/FILE_STRUCTURE.md)** - Complete project structure guide
- **[Multi-Model & Worktree Guide](docs/MULTI_MODEL_AND_WORKTREE_GUIDE.md)** - Using multiple AI models and GitHub worktrees

---

## ⚡ Support

For issues or questions:
1. Run diagnostic: `.\scripts\diagnose_trading.ps1`
2. Check server logs
3. Review documentation in `/docs`

---

**Status**: ✅ Production Ready | **Version**: 7.0.0 | **License**: MIT
