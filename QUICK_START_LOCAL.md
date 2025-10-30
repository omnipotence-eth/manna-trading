# Quick Start: Local Development Setup

Since you've cleaned up Vercel deployments, here's how to start testing locally:

## ✅ Immediate Steps

### 1. Verify Ollama is Running
```bash
ollama list
# Should show deepseek-r1:32b
```

### 2. Start Local Development Server
```bash
cd C:\Users\ttimm\Desktop\Manna
npm run dev
```

### 3. Open Dashboard
- Browser: `http://localhost:3000`
- Dashboard will load locally

### 4. Test System Startup
- Visit: `http://localhost:3000/api/multi-agent?action=test-deepseek`
- Should return success if Ollama is connected

### 5. Start Trading System
- Visit: `http://localhost:3000/api/multi-agent?action=start&symbol=BTC/USDT`
- Or use dashboard "Start Trading" button

## 🎯 What to Monitor

- Terminal logs for errors
- Dashboard for agent insights
- Positions tab for trades
- Performance metrics

## ⚠️ Important

- System runs entirely on your local machine
- Uses your RTX 5070 Ti GPU for LLM
- No cloud deployments needed
- Full control over testing

## 📝 Next Steps After Testing

When ready for production:
1. Test locally for 24-48 hours
2. Fix any issues
3. Deploy to new Vercel project:
   ```bash
   vercel --prod
   ```

