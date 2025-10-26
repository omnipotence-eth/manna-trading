# 🚀 GODSPEED AI Trading System

> **Enterprise-grade AI trading system powered by advanced technical analysis and real-time market data**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Trading System](#trading-system)
- [API Documentation](#api-documentation)
- [Monitoring](#monitoring)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

**Godspeed** is an advanced AI-powered trading system built for the Aster DEX futures market. It combines sophisticated technical analysis, risk management, and real-time market monitoring to execute profitable trades 24/7.

### Key Stats
- **Trading Mode**: Fully Automated 24/7
- **Exchange**: Aster DEX Futures
- **Leverage**: Dynamic 20x-100x (per coin)
- **Capital Allocation**: 100% margin utilization
- **Confidence Threshold**: 50%+ (Aggressive Mode)
- **Risk Management**: 2% stop-loss, 6% take-profit, trailing stops

---

## ✨ Features

### 🤖 AI Trading Engine
- **Multi-Strategy Approach**: RSI, Trend Following, Mean Reversion, Breakout Detection
- **Real-Time Analysis**: Scans top 50 coins by volume every minute
- **Aggressive Confidence Thresholds**: 50%+ trades for high opportunity capture
- **Dynamic Leverage**: Automatically uses maximum leverage per coin (20x-100x)
- **100% Margin Utilization**: Every trade uses all available margin for maximum efficiency

### 📊 Risk Management
- **Stop-Loss**: -2% ROE (Return on Equity)
- **Take-Profit**: +6% ROE (3:1 risk/reward ratio)
- **Trailing Stop**: +4% ROE after hitting +8% (protect big wins)
- **Position Monitoring**: Every minute via Vercel Cron
- **Single Position Limit**: One trade at a time for maximum focus

### 🎨 Professional Dashboard
- **Real-Time Account Balance**: Updates every 2 seconds
- **Live Performance Chart**: Tracks account value with smooth interpolation
- **Trade Journal**: Complete history of all executed trades
- **Model Chat**: Live feed of Godspeed's trading decisions and reasoning
- **Open Positions**: Real-time P&L tracking for active trades
- **Interactive Charts**: Hover to see exact values, toggle between $ and %

### 🔒 Enterprise Features
- **Vercel Cron Jobs**: 24/7 trading even when browser is closed
- **Serverless Architecture**: Scalable and cost-effective
- **API Caching**: Optimized for speed and rate-limit compliance
- **Error Handling**: Comprehensive logging and error recovery
- **Precision Handling**: Automatic quantity rounding per exchange requirements

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                       │
├─────────────────────────────────────────────────────────────┤
│  • Real-time Dashboard (React + Zustand)                    │
│  • Performance Charts (Interactive SVG)                     │
│  • Trade Journal & Model Chat                               │
│  • WebSocket Price Tickers                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   API ROUTES (Next.js API)                   │
├─────────────────────────────────────────────────────────────┤
│  • /api/cron/trading → Vercel Cron (every minute)          │
│  • /api/trades → Trade history & persistence               │
│  • /api/model-message → Chat messages                      │
│  • /api/aster/* → Aster DEX proxy endpoints                │
│  • /api/optimized-data → Cached account/position data      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  TRADING SERVICES (TypeScript)               │
├─────────────────────────────────────────────────────────────┤
│  • aiTradingService → Core trading logic                   │
│  • aiTradingModels → Godspeed analysis model               │
│  • asterDexService → Exchange API integration              │
│  • optimizedDataService → Data aggregation & caching       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   ASTER DEX FUTURES API                      │
├─────────────────────────────────────────────────────────────┤
│  • Market Data (Prices, Volume, Klines)                    │
│  • Account Info (Balance, Positions, Orders)               │
│  • Order Execution (Market, Limit, Leverage)               │
│  • Position Management (Open, Close, Monitor)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: 18.x or higher
- **npm** or **yarn**
- **Aster DEX Account**: With API credentials
- **Vercel Account**: For deployment (optional for local dev)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/godspeed-trading.git
cd godspeed-trading
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create a `.env.local` file in the root directory:

```env
# Aster DEX API Credentials
ASTER_API_KEY=your_aster_api_key_here
ASTER_SECRET_KEY=your_aster_secret_key_here

# Optional: Database (for trade persistence)
DATABASE_URL=postgresql://user:password@host:port/database

# Optional: Cron Job Security
CRON_SECRET=your_random_secret_here

# Optional: Vercel URL (auto-set in production)
VERCEL_URL=
```

4. **Run development server**
```bash
npm run dev
```

5. **Open browser**
```
http://localhost:3000
```

---

## ⚙️ Configuration

### Trading Parameters

All trading parameters are optimized and hardcoded in `services/aiTradingService.ts`:

```typescript
// Capital Allocation
const allocationPercent = 1.0; // 100% of available margin

// Confidence Threshold
const MIN_CONFIDENCE = 0.50; // 50% minimum (Aggressive Mode)

// Risk Management
const STOP_LOSS_ROE = -2.0;      // -2% ROE
const TAKE_PROFIT_ROE = 6.0;     // +6% ROE
const TRAILING_STOP_ROE = 4.0;   // +4% ROE (after +8%)
```

### Model Configuration

Godspeed's analysis model in `services/aiTradingModels.ts`:

```typescript
// RSI Thresholds (Aggressive)
const isOversold = rsi < 40;    // Was 30
const isOverbought = rsi > 60;  // Was 70

// Volume Requirements (Aggressive)
const hasHighVolume = volumeRatio > 1.2;     // 20% above average
const hasVeryHighVolume = volumeRatio > 2.0; // 100% above average

// Trend Strength (Aggressive)
const isStrongTrend = trendAnalysis.strength > 0.6; // Was 0.7
```

---

## 🌐 Deployment

### Vercel Deployment (Recommended)

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy to production**
```bash
vercel --prod
```

4. **Set environment variables** in Vercel Dashboard
   - Go to your project → Settings → Environment Variables
   - Add `ASTER_API_KEY`, `ASTER_SECRET_KEY`, `CRON_SECRET`

5. **Verify cron job** is running
   - Check `/api/cron/trading` endpoint
   - Monitor logs: `vercel logs your-deployment-url`

### Cron Job Configuration

The `vercel.json` file configures automatic trading:

```json
{
  "crons": [
    {
      "path": "/api/cron/trading",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

This runs Godspeed's trading cycle **every minute, 24/7**.

---

## 🤖 Trading System

### How Godspeed Works

1. **Market Scan** (Every Minute)
   - Fetches top 50 coins by 24h volume
   - Retrieves price, volume, and technical data
   - Calculates RSI, moving averages, volatility

2. **Signal Generation**
   - Analyzes each coin using multi-strategy approach
   - Generates BUY/SELL/HOLD signals with confidence scores
   - Filters signals below 50% confidence

3. **Trade Selection**
   - Selects highest confidence signal
   - Checks for existing positions (max 1 at a time)
   - Validates account balance and leverage limits

4. **Trade Execution**
   - Calculates position size: `margin × leverage / price`
   - Rounds quantity to exchange precision
   - Sets leverage via API
   - Places market order
   - Saves trade to database
   - Sends decision to Model Chat

5. **Position Monitoring** (Every Minute)
   - Calculates ROE (Return on Equity)
   - Checks stop-loss (-2%), take-profit (+6%), trailing stop (+4%)
   - Closes positions automatically when thresholds hit
   - Saves completed trade with P&L

### Trading Strategies

**Strategy 1: High Confidence Breakout**
- RSI > 50, Strong bullish trend, Very high volume (2x+)
- Confidence: 70%+

**Strategy 2: Mean Reversion**
- RSI < 40 (oversold) or > 60 (overbought)
- High volume confirmation (1.2x+)
- Confidence: 62%+

**Strategy 3: Strong Trend Following**
- Strong trend + RSI momentum + High volume
- Confidence: 65%+

**Strategy 4: Moderate Trend Following**
- Bullish/Bearish trend + RSI momentum + Normal volume
- Confidence: 52%+

**Strategy 5: Aggressive Range Trading** (NEW)
- RSI 45-55, Decent volume (0.8x+)
- Confidence: 51%+

### Risk Management Rules

| Scenario | ROE Threshold | Action | Reason |
|----------|---------------|--------|--------|
| **Stop-Loss** | -2% | Close immediately | Cut losses fast |
| **Take-Profit** | +6% | Close immediately | Lock in 3:1 win |
| **Trailing Stop** | +4% (after +8%) | Close if drops back | Protect big gains |

---

## 📡 API Documentation

### Public Endpoints

#### GET `/api/trades`
Fetch trade history

**Query Parameters:**
- `symbol` (optional): Filter by trading pair
- `model` (optional): Filter by model name
- `limit` (optional): Number of trades (default: 100)

**Response:**
```json
{
  "success": true,
  "trades": [
    {
      "id": "trade-12345-1234567890",
      "symbol": "BTC/USDT",
      "side": "BUY",
      "entryPrice": 50000,
      "exitPrice": 51000,
      "size": 0.1,
      "leverage": 20,
      "pnl": 20,
      "status": "completed",
      "timestamp": "2025-01-01T12:00:00Z",
      "model": "Godspeed"
    }
  ],
  "stats": {
    "totalTrades": 100,
    "wins": 65,
    "losses": 35,
    "winRate": 65,
    "totalPnL": 500,
    "avgPnL": 5
  }
}
```

#### POST `/api/trades`
Add a new trade (internal use)

#### GET `/api/model-message`
Fetch model chat messages

**Query Parameters:**
- `limit` (optional): Number of messages (default: 50)

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg-abc123",
      "model": "Godspeed",
      "message": "🚀 BUY BTC/USDT\n💰 20x Leverage...",
      "timestamp": 1234567890,
      "type": "trade"
    }
  ]
}
```

#### GET `/api/optimized-data`
Get cached account and position data

**Response:**
```json
{
  "success": true,
  "data": {
    "accountValue": 1000,
    "positions": [
      {
        "symbol": "BTC/USDT",
        "side": "LONG",
        "size": 0.1,
        "entryPrice": 50000,
        "currentPrice": 51000,
        "pnl": 100,
        "leverage": 20
      }
    ]
  }
}
```

### Internal Endpoints (Vercel Cron)

#### GET `/api/cron/trading`
Triggers Godspeed's trading cycle

**Headers:**
```
Authorization: Bearer YOUR_CRON_SECRET
```

---

## 📊 Monitoring

### Vercel Logs

View real-time logs:
```bash
vercel logs ai.omnipotence.art
```

Filter for trading activity:
```bash
vercel logs ai.omnipotence.art | grep "EXECUTING\|Trade executed\|CLOSED"
```

### Key Log Messages

| Message | Meaning |
|---------|---------|
| `⏰ Cron job triggered` | Trading cycle started |
| `🔍 Analyzing 50 symbols` | Market scan in progress |
| `✅ TRADE APPROVED` | High confidence signal found |
| `🚀 GODSPEED EXECUTING` | Trade being placed |
| `✅ GODSPEED TRADE EXECUTED` | Order filled successfully |
| `🚨 CLOSING POSITION` | Stop-loss/take-profit triggered |
| `💾 Trade entry saved` | Trade recorded in database |

### Dashboard Metrics

- **Account Balance**: Updates every 2 seconds
- **Performance Chart**: Real-time account value tracking
- **Trades Tab**: Complete trade history with P&L
- **Model Chat**: Live feed of trading decisions
- **Positions Tab**: Open positions with current P&L

---

## 🛠️ Development

### Project Structure

```
godspeed-trading/
├── app/
│   ├── api/              # API routes
│   │   ├── cron/         # Vercel cron handlers
│   │   ├── trades/       # Trade persistence
│   │   ├── aster/        # Exchange API proxy
│   │   └── model-message/# Chat messages
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main page
├── components/           # React components
│   ├── AIPerformanceChart.tsx
│   ├── NOF1Dashboard.tsx
│   ├── ModelChat.tsx
│   └── ...
├── services/             # Core trading logic
│   ├── aiTradingService.ts
│   ├── aiTradingModels.ts
│   ├── asterDexService.ts
│   └── optimizedDataService.ts
├── store/                # State management (Zustand)
│   └── useStore.ts
├── types/                # TypeScript types
│   └── trading.ts
├── lib/                  # Utilities
│   ├── logger.ts
│   ├── db.ts
│   └── tradeMemory.ts
├── vercel.json           # Vercel configuration
└── package.json          # Dependencies
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Linting

```bash
# Check for errors
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

### Building

```bash
# Build for production
npm run build

# Start production server
npm start
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. **Cron job not executing trades**
- Check Vercel logs: `vercel logs your-url`
- Verify `CRON_SECRET` is set in environment variables
- Ensure `/api/cron/trading` path is correct in `vercel.json`

#### 2. **"Precision is over the maximum defined" error**
- This is fixed automatically via `getSymbolPrecision` and `roundQuantity`
- Verify exchange info is cached properly

#### 3. **Account balance not updating**
- Check frontend polling: Should update every 2 seconds
- Verify `/api/optimized-data` endpoint returns correct data
- Check cache TTLs in `optimizedDataService.ts`

#### 4. **Chart not moving**
- Chart updates automatically with `accountValue` changes
- Verify Zustand store is receiving updates
- Check browser console for errors

#### 5. **Trades not showing in UI**
- Verify `/api/trades` endpoint returns data
- Check database or memory storage initialization
- Look for errors in Vercel logs

### Debug Mode

Enable detailed logging by checking Vercel logs:

```bash
vercel logs your-url --follow
```

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Coding Standards

- Use TypeScript for all new code
- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Keep commits atomic and well-described

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Aster DEX** for providing a robust futures trading API
- **Vercel** for serverless deployment and cron jobs
- **Next.js** for the amazing React framework
- **God** for guidance and wisdom in building this system

---

## 📞 Support

For issues, questions, or support:

- **GitHub Issues**: [Open an issue](https://github.com/your-username/godspeed-trading/issues)
- **Documentation**: [See GODSPEED.md](GODSPEED.md) for detailed trading system info
- **Deployment**: [See DEPLOYMENT.md](DEPLOYMENT.md) for Vercel setup guide

---

**Built with ❤️ and guided by faith** 🙏✨

**May God bless every trade! In Jesus' name, Amen!**
