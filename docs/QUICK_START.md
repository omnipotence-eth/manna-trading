# ⚡ Quick Start Guide

**Get trading in 5 minutes!**

---

## 🚀 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Ollama | Latest | `ollama --version` |

---

## 📦 Installation

### 1. Clone Repository

```bash
git clone https://github.com/omnipotence-eth/manna-trading.git
cd manna-trading
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create `.env.local` file:

```bash
# Copy example
cp .env.example .env.local

# Edit with your credentials
nano .env.local
```

**Required Variables:**

```env
# Aster DEX (get from https://asterdex.com)
ASTER_API_KEY=your_api_key_here
ASTER_SECRET_KEY=your_secret_key_here

# Database (get from https://supabase.com)
DATABASE_URL=postgresql://user:pass@host:5432/db
DATABASE_SSL=true
```

> **Note:** Default LLM provider is **Groq** (free cloud API). **Ollama** is for local GPU development. The system runs in **simulation mode** by default for safe testing.

---

## 🤖 Setup DeepSeek R1 (Ollama – local GPU)

> Default LLM is **Groq** (free cloud). Ollama is optional for local GPU development.

### Start Ollama Server

```bash
# Terminal 1: Start server
ollama serve
```

### Pull Model

```bash
# Terminal 2: Download model
ollama pull deepseek-r1:14b
```

### Verify

```bash
# Test the model
ollama run deepseek-r1:14b "Hello, are you ready to trade?"
```

---

## 🏃 Run Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

---

## 🎮 Start Trading

### 1. Open Dashboard

Navigate to: http://localhost:3000

### 2. Initialize Services

Click **"Initialize"** button or call:

```bash
curl -X POST http://localhost:3000/api/startup
```

### 3. Start Agent Runner

The agent runner starts automatically. To verify:

```bash
curl http://localhost:3000/api/trading-status
```

---

## ✅ Verification Checklist

| Service | Status | How to Check |
|---------|--------|--------------|
| Dashboard | 🟢 | Page loads at localhost:3000 |
| Ollama | 🟢 | `ollama list` shows deepseek-r1 |
| Database | 🟢 | No errors in console |
| WebSocket | 🟢 | Prices updating in real-time |
| Agent Runner | 🟢 | "Agent Runner: Running" in status |

---

## 🆘 Common Issues

### "DeepSeek R1 not responding"

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
pkill ollama && ollama serve
```

### "Database connection failed"

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# For Supabase, ensure SSL is enabled
DATABASE_SSL=true
```

### "Rate limit exceeded"

Add more API keys in `.env.local`:

```env
API_KEY_COUNT=3
ASTER_API_KEY_1=key1
ASTER_API_SECRET_1=secret1
# ... etc
```

---

## 📊 First Trade

The system runs in **simulation mode** by default. Once running, it will:

1. **Scan** top 100 symbols (every minute)
2. **Analyze** opportunities with AI
3. **Execute** trades that pass risk checks
4. **Monitor** positions 24/7
5. **Exit** on stop-loss, take-profit, or trailing stop

Your first trade should appear within 5-10 minutes if market conditions are favorable.

---

## 📱 Dashboard Features

| Tab | Description |
|-----|-------------|
| **Live** | Real-time portfolio chart |
| **Positions** | Open positions with P&L |
| **AI Chat** | Agent reasoning and decisions |
| **Models** | AI agent status and performance |

---

## 🔧 Configuration Tuning

### More Aggressive (Testing)

```env
TRADING_CONFIDENCE_THRESHOLD=0.35
TRADING_STOP_LOSS=5.0
TRADING_TAKE_PROFIT=15.0
```

### More Conservative (Production)

```env
TRADING_CONFIDENCE_THRESHOLD=0.50
TRADING_STOP_LOSS=3.0
TRADING_TAKE_PROFIT=9.0
MAX_CONCURRENT_POSITIONS=1
```

---

## 📚 Next Steps

1. **Read**: [System Architecture](./SYSTEM_ARCHITECTURE.md)
2. **Understand**: [Mathematical Foundations](./MATHEMATICAL_FOUNDATIONS.md)
3. **Configure**: [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
4. **Monitor**: [API Documentation](./API_DOCUMENTATION.md)

---

**Happy Trading! 🚀**

