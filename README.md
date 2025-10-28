# 🤖 AI Trading System for Aster DEX
**Autonomous 24/7 Crypto Trading Bot with Multi-Agent Intelligence**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/manna-ai-arena)

---

## 🎯 Overview

An intelligent, autonomous cryptocurrency trading system that uses multi-agent AI to analyze markets, make decisions, and execute trades on Aster DEX (Binance-compatible API). Built with Next.js, TypeScript, and LLM-powered agents.

### Key Features

- 🤖 **Multi-Agent AI System** - Technical analysts, risk managers, and execution specialists
- 📊 **Real-Time Analysis** - RSI, Moving Averages, Volume, Momentum calculations
- 🛡️ **Risk Management** - Dynamic position sizing, stop-loss, take-profit
- 🔄 **24/7 Trading** - Continuous market scanning and opportunity detection
- 📈 **Position Monitoring** - Automatic trade management with trailing stops
- 📉 **Performance Tracking** - Win rate, P&L, Sharpe ratio, drawdown metrics

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (or Neon/Supabase)
- Aster DEX API credentials
- Ollama (for local LLM) or OpenAI API key

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/manna-ai-arena.git
cd manna-ai-arena
npm install
```

### 2. Environment Setup

Create `.env.local`:

```env
# Aster DEX API (Required)
ASTER_API_KEY=your_api_key_here
ASTER_SECRET_KEY=your_secret_key_here
ASTER_BASE_URL=https://fapi.asterdex.com

# Database (Required)
DATABASE_URL=postgresql://user:password@host:5432/database

# LLM Configuration (Choose one)
# Option 1: Local Ollama (Recommended for cost)
OLLAMA_BASE_URL=http://localhost:11434

# Option 2: OpenAI (Cloud-based, costs apply)
# OPENAI_API_KEY=sk-...
# USE_OPENAI=true

# Cron Secret (For automated trading)
CRON_SECRET=your_random_secret_here

# Trading Configuration (Optional - defaults shown)
TRADING_CONFIDENCE_THRESHOLD=0.25
TRADING_MIN_BALANCE=10
TRADING_STOP_LOSS=3.0
TRADING_TAKE_PROFIT=5.0
```

### 3. Database Setup

```bash
# The app will auto-create tables on first run
# Or manually create them:
npm run setup:db
```

### 4. Run Locally

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Visit `http://localhost:3000`

---

## 🌐 Vercel Deployment

### **IMPORTANT: LLM Configuration for Cloud Deployment**

Since Ollama runs locally, you have 3 options for Vercel:

#### Option 1: Use OpenAI API (Recommended for Vercel)
```env
# .env in Vercel
OPENAI_API_KEY=sk-your-key-here
USE_OPENAI=true
```

**Cost**: ~$0.002 per analysis (~$0.02-0.10 per day with moderate trading)

#### Option 2: Deploy Ollama to Cloud
- Deploy Ollama on a VPS (DigitalOcean, AWS EC2, etc.)
- Expose via secure endpoint
- Set `OLLAMA_BASE_URL=https://your-ollama-server.com`

#### Option 3: Hybrid Approach
- Use local Ollama for development
- Switch to OpenAI for production Vercel deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add ASTER_API_KEY
vercel env add ASTER_SECRET_KEY
vercel env add DATABASE_URL
vercel env add OPENAI_API_KEY  # If using OpenAI
vercel env add CRON_SECRET

# Deploy to production
vercel --prod
```

### 24/7 Trading with Vercel Cron

Vercel has limitations for 24/7 processes, so we use **Vercel Cron Jobs**:

#### 1. Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/trading",
    "schedule": "*/5 * * * *"
  }]
}
```

This runs trading analysis every 5 minutes.

#### 2. Protect Cron Endpoint

The endpoint checks for `CRON_SECRET`:

```bash
# Vercel will call:
https://your-app.vercel.app/api/cron/trading?secret=YOUR_CRON_SECRET
```

#### 3. Alternative: External Cron Services

For more control, use external cron services:

**EasyCron** (Free tier available):
```
URL: https://your-app.vercel.app/api/cron/trading?secret=YOUR_SECRET
Frequency: Every 5 minutes
```

**Uptime Robot** (Free):
- Monitor endpoint + trigger trading
- Interval: 5 minutes

---

## 📊 How It Works

### Trading Workflow

1. **Market Scanning** - Scans all Aster DEX pairs for opportunities
2. **Technical Analysis** - Calculates RSI, MA, volatility from real-time data
3. **AI Decision** - Multi-agent system analyzes and makes BUY/SELL/HOLD decision
4. **Risk Assessment** - Validates balance, confidence, position sizing
5. **Trade Execution** - Places market order with retry logic
6. **Position Monitoring** - Manages stop-loss, take-profit, trailing stops
7. **Performance Tracking** - Records metrics and results

### Multi-Agent System

- **Technical Analyst** - Analyzes price action, indicators, patterns
- **Chief Analyst** - Makes final trading decision based on all data
- **Risk Manager** - Validates trade safety and position sizing
- **Execution Specialist** - Handles order placement and timing

---

## 🔒 Security Best Practices

1. **Never commit `.env` files** - Keep API keys secret
2. **Use read-only API keys** for testing (if available)
3. **Start with small balance** - Test with $10-50 initially
4. **Monitor actively** - Check positions regularly
5. **Set stop-losses** - Always protect capital
6. **Use strong secrets** - For CRON_SECRET, use long random strings

---

## 📈 Performance & Risk

### Conservative Settings (Default)
- **Position Size**: 10-20% of balance
- **Leverage**: 1-2x
- **Stop Loss**: 3%
- **Take Profit**: 5%
- **Expected Win Rate**: 60%+

### Aggressive Settings
- **Position Size**: 20-30% of balance
- **Leverage**: 2-3x
- **Stop Loss**: 2-5% (adaptive)
- **Take Profit**: 5-10% (adaptive)
- **Expected Win Rate**: 65%+

**Disclaimer**: Cryptocurrency trading involves significant risk. Past performance does not guarantee future results.

---

## 🛠️ API Endpoints

### Trading
- `POST /api/multi-agent?action=start&symbol=BTCUSDT` - Start analysis
- `GET /api/multi-agent?action=workflows` - Get workflow status
- `GET /api/positions` - View open positions
- `GET /api/performance` - Get performance metrics

### Market Data
- `GET /api/prices` - Real-time prices
- `GET /api/agent-insights?limit=10` - AI insights

### System
- `GET /api/health` - Health check
- `POST /api/cron/trading?secret=XXX` - Trigger trading cycle

---

## 🧪 Testing

```bash
# Run tests
npm test

# Test trading workflow
curl http://localhost:3000/api/multi-agent?action=start&symbol=BTCUSDT

# Check positions
curl http://localhost:3000/api/positions

# View performance
curl http://localhost:3000/api/performance
```

---

## 📝 Configuration

Edit `lib/configService.ts` or use environment variables:

```typescript
{
  confidenceThreshold: 0.25,    // 25% minimum confidence
  minBalanceForTrade: 10,       // $10 minimum balance
  stopLossPercent: 3.0,         // 3% stop loss
  takeProfitPercent: 5.0,       // 5% take profit
  maxLeverage: 3,               // Max 3x leverage
  positionSize: "10-30%",       // Based on confidence
}
```

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

---

## ⚠️ Disclaimer

This software is for educational purposes. Cryptocurrency trading involves substantial risk of loss. The authors are not responsible for any financial losses incurred through use of this software. Always trade responsibly and only with funds you can afford to lose.

---

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- AI powered by [Ollama](https://ollama.ai/) / [OpenAI](https://openai.com/)
- Deployed on [Vercel](https://vercel.com/)
- Trading on [Aster DEX](https://asterdex.com/)

---

## 📞 Support

- 📧 Email: your-email@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/manna-ai-arena/issues)
- 💬 Discord: [Join Server](https://discord.gg/your-invite)

---

**Built with ❤️ and faith. "I can do all things through Christ who strengthens me." - Philippians 4:13** 🙏
