# 🚀 Manna AI Trading Arena

A real-time AI trading platform powered by Aster DEX, featuring live cryptocurrency prices and AI-driven trading strategies.

---

## ✅ Current Status: PRODUCTION READY

- **Real Cryptocurrency Prices**: Live BTC, ETH, SOL, BNB, DOGE, XRP from Aster DEX
- **AI Trading Model**: AlphaTrader with $100 initial capital
- **Clean UI**: Terminal-style interface with real-time updates
- **WebSocket**: Live price streaming from Aster DEX exchange

---

## 🎯 Features

### Real-Time Market Data
- ✅ Live prices from Aster DEX public API (Binance-compatible)
- ✅ 24-hour ticker data (volume, price changes)
- ✅ WebSocket streaming for real-time updates
- ✅ 6 cryptocurrencies: BTC, ETH, SOL, BNB, DOGE, XRP

### AI Trading
- ✅ AlphaTrader: Momentum + Trend Following strategy
- ✅ Analyzes BTC/USDT every 10 seconds
- ✅ Executes trades when confidence > 60%
- ✅ Real-time P&L tracking

### Modern UI
- ✅ Clean, terminal-inspired design
- ✅ Price ticker with live updates
- ✅ Interactive trading dashboard
- ✅ Model performance tracking
- ✅ Real-time position monitoring

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional)
Create `.env.local` if you want to customize:
```bash
# API Configuration (uses public endpoints by default)
ASTER_BASE_URL=https://fapi.asterdex.com
ASTER_WS_URL=wss://fstream.asterdex.com/stream

# WebSocket (set to true for real prices)
NEXT_PUBLIC_USE_REAL_WEBSOCKET=true

# Initial Trading Capital
INITIAL_CAPITAL=100
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Open Browser
Navigate to `http://localhost:3000`

---

## 📊 How It Works

### Real Price Data
The app fetches **REAL** cryptocurrency prices from Aster DEX's public API:
- **API**: `https://fapi.asterdex.com/fapi/v1/ticker/price`
- **WebSocket**: `wss://fstream.asterdex.com/stream`
- **Format**: Binance-compatible (no authentication required)

### AI Trading
1. **AlphaTrader** analyzes BTC/USDT momentum every 10 seconds
2. Calculates confidence based on price trends and volume
3. When confidence > 60%, prepares to execute trade
4. Updates UI with analysis and trading decisions

### Account Balance
- **Initial**: $100 USDT
- **Updates**: Based on real price movements
- **P&L**: Calculated from open positions

---

## 🏗️ Project Structure

```
manna/
├── app/
│   ├── api/
│   │   └── asterdex/
│   │       └── [...path]/route.ts    # API proxy (optional)
│   ├── page.tsx                      # Main page
│   ├── layout.tsx                    # Root layout
│   └── globals.css                   # Global styles
├── components/
│   ├── Dashboard.tsx                 # Main dashboard
│   ├── PriceTicker.tsx              # Live price ticker
│   ├── LivePriceDisplay.tsx         # Price cards
│   ├── TradingChart.tsx             # Account value chart
│   ├── Positions.tsx                # Open positions
│   ├── CompletedTrades.tsx          # Trade history
│   ├── ModelChat.tsx                # AI analysis feed
│   └── ErrorBoundary.tsx            # Error handling
├── services/
│   ├── asterDexService.ts           # Aster DEX integration
│   └── aiTradingService.ts          # AI trading logic
├── store/
│   └── useStore.ts                  # Zustand state management
├── lib/
│   ├── logger.ts                    # Logging utility
│   └── rateLimiter.ts               # Rate limiting
├── constants/
│   └── index.ts                     # App constants
└── types/
    └── trading.ts                   # TypeScript types
```

---

## 🎮 Available Scripts

```bash
# Development
npm run dev          # Start dev server at localhost:3000

# Production
npm run build        # Build for production
npm start            # Start production server

# Testing
npm test             # Run test suite
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report

# Linting
npm run lint         # Check code quality
```

---

## 🔧 Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Charts**: Recharts
- **Animation**: Framer Motion
- **Testing**: Jest + React Testing Library
- **API**: Aster DEX (Binance-compatible)

---

## 📈 Real Data Examples

### What You'll See:

**Price Ticker**:
```
BTC $108,043.50 ▲ 2.35% | ETH $3,456.78 ▼ 1.20% | SOL $182.45 ▲ 0.80%
```

**Account Value**:
```
TOTAL ACCOUNT VALUE
$102.45
```

**Model Chat**:
```
[ANALYSIS] AlphaTrader: BTC momentum increasing, confidence 45%
[TRADE] Executing BUY 0.0009 BTC/USDT @ confidence 67.3%
```

---

## ⚠️ Important Notes

### Data Sources
- **Prices**: 100% REAL from Aster DEX public API
- **Balance**: Simulated $100 (requires API keys for real balance)
- **Trading**: Simulated (requires API keys for real trading)

### To Enable Real Trading
1. Create account at https://www.asterdex.com
2. Generate API keys
3. Add to `.env.local`:
   ```bash
   ASTER_API_KEY=your_api_key_here
   ASTER_SECRET_KEY=your_secret_key_here
   ```
4. Restart server

⚠️ **WARNING**: Real trading uses real money! Start with small amounts.

---

## 🐛 Troubleshooting

### Prices Show $0
- Check browser console for errors
- Verify internet connection
- Check Aster DEX API status

### WebSocket Not Connecting
- Ensure `NEXT_PUBLIC_USE_REAL_WEBSOCKET=true` in `.env.local`
- Check firewall settings
- Try refreshing the page

### Build Errors
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

## 📚 Documentation

- [Aster DEX API](https://github.com/asterdex/api-docs)
- [Next.js Docs](https://nextjs.org/docs)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)

---

## 🎯 Roadmap

- [x] Real price integration
- [x] WebSocket streaming
- [x] AI trading engine
- [x] Clean UI
- [ ] Real trading with API keys
- [ ] Multiple AI models
- [ ] Portfolio analytics
- [ ] Mobile responsive

---

## 📄 License

MIT License - see LICENSE file

---

## 🙏 Acknowledgments

- Built with ❤️ for the crypto trading community
- Powered by [Aster DEX](https://www.asterdex.com)
- Inspired by nof1.ai

---

**Made by traders, for traders** 🚀

Check your browser at `http://localhost:3000` to see **REAL** cryptocurrency prices!
