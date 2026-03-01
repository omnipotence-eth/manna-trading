# 🚀 Quick Startup Guide

**Last Updated:** December 2025

---

## ⚡ One-Command Startup

```bash
npm run dev
```

That's it! The system will automatically:
1. ✅ Start Next.js development server
2. ✅ Initialize all services (30-90 seconds)
3. ✅ Start Agent Runner (24/7 trading)
4. ✅ Start Position Monitor
5. ✅ Start Health Monitor

**Server URL:** http://localhost:3000

---

## 📋 Prerequisites

### Required
- ✅ Node.js 18+ (you have v22.21.1)
- ✅ npm 9+ (you have 10.9.4)
- ✅ `.env.local` file with API keys

### Optional (for full functionality)
- **Groq** is the default LLM provider (free cloud API); **Ollama** is for local GPU development
- Ollama running (for local AI agents)
- DeepSeek R1 model downloaded
- PostgreSQL database (for persistence)

> **Note:** The system runs in **simulation mode** by default for safe testing.

---

## 🔧 Environment Setup

Your `.env.local` should contain:

```env
# Required
ASTER_API_KEY=your_api_key
ASTER_SECRET_KEY=your_secret_key

# Optional
DATABASE_URL=your_postgres_url
OLLAMA_BASE_URL=http://localhost:11434
DEEPSEEK_MODEL=deepseek-r1:14b
```

---

## 🎯 What Happens on Startup

### Automatic Initialization (via `instrumentation.ts`)

1. **Server Starts** (~2-3 seconds)
   - Next.js dev server on port 3000

2. **Service Initialization** (~30-90 seconds)
   - Real Balance Service
   - Position Monitor Service
   - Agent Runner Service (24/7 trading)
   - Health Monitor Service
   - WebSocket connections

3. **AI Model Check** (~10-30 seconds)
   - Verifies Ollama connection
   - Checks DeepSeek R1 model availability

4. **Trading System Ready**
   - Agent Runner starts scanning markets
   - First trading cycle runs in 2 minutes

---

## 📊 Verify System Status

### Check Startup Status
```powershell
# In browser or PowerShell
http://localhost:3000/api/startup?action=status
```

### Check Agent Runner
```powershell
http://localhost:3000/api/agent-runner?action=status
```

### Check Trading Status
```powershell
http://localhost:3000/api/trading-status
```

---

## 🌐 Access Points

### Main Dashboard
- **Landing Page:** http://localhost:3000
- **Trading Dashboard:** http://localhost:3000/trading

### API Endpoints
- **Startup Status:** http://localhost:3000/api/startup?action=status
- **Trading Status:** http://localhost:3000/api/trading-status
- **Agent Insights:** http://localhost:3000/api/agent-insights
- **Positions:** http://localhost:3000/api/positions

---

## 🔍 Monitoring

### Terminal Output
Watch the terminal for:
- `[SERVER STARTUP]` messages
- `[OK]` success indicators
- `[ERROR]` error messages
- `[WARN]` warnings

### Dashboard
Open http://localhost:3000/trading to see:
- Real-time portfolio chart
- Open positions
- AI agent insights
- Trading activity

---

## ⚠️ Troubleshooting

### Server Won't Start
- Check if port 3000 is available
- Verify Node.js version (18+)
- Check for syntax errors

### Services Not Initializing
- Check `.env.local` has required keys
- Verify Ollama is running (if using AI)
- Check database connection (if using DB)

### Agent Runner Not Starting
- Check `ENABLE_24_7_AGENTS=true` in `.env.local`
- Verify API keys are valid
- Check account balance > $5

---

## 📚 More Information

- **Full Documentation:** `docs/README.md`
- **Architecture:** `docs/SYSTEM_ARCHITECTURE.md`
- **API Reference:** `docs/API_DOCUMENTATION.md`
- **Startup Commands:** `docs/STARTUP_COMMANDS.md`

---

**Status:** ✅ System starting...

