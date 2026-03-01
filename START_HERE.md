# 🚀 Manna LLM Aster Crypto Trader

**AI-Powered Cryptocurrency Trading System**

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your credentials

# 3. (Optional) Start Ollama for local GPU development
#    Default: Groq (free cloud API). Ollama is for local GPU.
ollama serve
ollama pull deepseek-r1:14b

# 4. Run the application
npm run dev

# 5. Open dashboard
# http://localhost:3000
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Full project overview |
| [Quick Start](./docs/QUICK_START.md) | Get trading in 5 minutes |
| [API Reference](./docs/API_DOCUMENTATION.md) | All API endpoints |
| [Architecture](./docs/SYSTEM_ARCHITECTURE.md) | Technical deep-dive |
| [Math Foundations](./docs/MATHEMATICAL_FOUNDATIONS.md) | Trading algorithms |
| [Lessons Learned](./LESSONS.md) | Design trade-offs and notes |
| [Tax Export](./docs/TAX_EXPORT.md) | Tax and audit CSV export |

---

## 🔧 Required Environment Variables

```env
# Aster DEX API (required)
ASTER_API_KEY=your_key
ASTER_SECRET_KEY=your_secret

# Database (optional; recommended for persistence)
DATABASE_URL=your_connection_string
DATABASE_SSL=true

# AI: Groq (default, cloud) or Ollama (local GPU)
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_key   # Required when using Groq (e.g. on Vercel)

# Optional when using Ollama for local development
OLLAMA_BASE_URL=http://localhost:11434
DEEPSEEK_MODEL=deepseek-r1:14b
```

---

## 🎯 System Features

- ✅ Simulation mode (default) – safe for testing; enable live trading when ready
- ✅ Multi-Agent AI (DeepSeek R1)
- ✅ Real-time WebSocket data
- ✅ Kelly Criterion position sizing
- ✅ ATR-based stop-loss
- ✅ Chandelier Exit trailing stops
- ✅ 24/7 position monitoring
- ✅ ML learning pipeline
- ✅ Modern React dashboard

---

## 📞 Support

See [Troubleshooting](./docs/QUICK_START.md#-common-issues) or open a GitHub issue.

---

**Version 7.1.0** | Built with ❤️
