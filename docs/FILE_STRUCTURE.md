# 📁 Manna File Structure

**Clean, organized, professional structure for production use.**

---

## 📊 **ROOT DIRECTORY** (Core Documentation Only)

```
Manna/
├── README.md                     ⭐ Main project documentation
├── CHANGELOG.md                  📝 Version history & updates
├── LICENSE                       ⚖️ MIT License
├── VERSION                       🔢 Version number
├── package.json                  📦 NPM package config
├── next.config.js                ⚙️ Next.js config
├── tsconfig.json                 📘 TypeScript config
├── instrumentation.ts            🔧 Auto-initialization hook
└── env.keys.example              📝 Example environment config
```

**Only 5-6 essential documentation files in root!**

---

## 📚 **DOCUMENTATION FOLDER** (`/docs`)

```
docs/
├── PRODUCTION_DEPLOYMENT.md      🚀 Production deployment guide
├── QUICK_COMMANDS.md             ⚡ Command reference
├── AI_MODELS_REFERENCE.md        🤖 AI model documentation
├── AUTO_TRADING_24_7_GUIDE.md    📖 24/7 Trading Guide
├── CODEBASE_AUDIT_2025.md        🔍 Codebase Audit Report
├── SYSTEM_ARCHITECTURE.md        🏗️ Technical architecture
├── API_DOCUMENTATION.md          📚 Complete API reference
└── FILE_STRUCTURE.md             📁 This file
```

**Technical guides organized in one place.**

---

## 🛠️ **SCRIPTS FOLDER** (`/scripts`)

```
scripts/
├── start_trading.ps1             ⭐ Automated startup
├── diagnose_trading.ps1          🔍 System diagnostics
├── diagnose_chat_tab.ps1        💬 Chat tab diagnostics
├── capture_logs.ps1             📋 Log capture utility
├── capture_live_logs.ps1        📊 Live log monitoring
├── clean-test-positions.sql     🗄️ Database cleanup
├── create-position-tables.sql   🗄️ Position tables
├── create-trades-table.sql      🗄️ Trades table
├── fix-trades-confidence-column.sql
├── test-api-keys.js             🔑 API key testing
└── test-trading-system.js       🧪 System testing
```

**All automation scripts in one place.**

---

## 💻 **APPLICATION CODE**

### **`/app` - Next.js Application**
```
app/
├── api/                          API routes (20+ endpoints)
│   ├── agent-insights/          AI insights endpoint
│   ├── aster/                   Aster DEX endpoints
│   ├── startup/                 System initialization
│   ├── trades/                  Trade history
│   └── ...
├── layout.tsx                    App layout
├── page.tsx                      Main dashboard page
└── globals.css                   Global styles
```

### **`/components` - React Components**
```
components/
├── NOF1Dashboard.tsx             ⭐ Main dashboard
├── InteractiveChart.tsx          📈 Live balance chart
├── EnhancedAIChat.tsx            💬 AI insights chat
├── AgentsSystem.tsx              🤖 Agent system display
├── PriceTicker.tsx               💲 Live prices
├── Positions.tsx                 📊 Position display
├── TradeJournal.tsx              📝 Trade history
├── Models.tsx                    🧠 Model info
├── Header.tsx                    🎯 Navigation
├── ui/                           Reusable UI components
└── __tests__/                    Component tests
```

### **`/services` - Core Trading Services**
```
services/
├── agentRunnerService.ts         ⭐ 24/7 trading workflows
├── agentCoordinator.ts           🎯 Multi-agent orchestration
├── healthMonitorService.ts       🏥 Auto-restart system
├── asterDexService.ts            💱 Exchange API (30-key pool)
├── deepseekService.ts            🧠 AI model interface
├── realBalanceService.ts         💰 Balance tracking
├── positionMonitorService.ts     📊 Position management
├── marketScannerService.ts       🔍 Market opportunity scanner
├── dataIngestionService.ts       📥 Data collection
├── dynamicConfigService.ts       ⚙️ RL parameter optimizer
├── rlParameterOptimizer.ts       🤖 Reinforcement learning
├── [ARCHIVED] multiAgentTradingSystem.ts    🎯 Legacy (archived in docs/ARCHIVE/)
├── startupService.ts             🚀 System initialization
├── apiCache.ts                   💾 API response caching
├── optimizedDataService.ts       ⚡ Optimized data fetching
├── performanceTracker.ts         📈 Performance monitoring
├── problematicCoinDetector.ts    ⚠️ Coin risk detection
├── tradePatternAnalyzer.ts       🔍 Pattern analysis
├── systemAuditor.ts              🔍 System health audits
└── __tests__/                    Service tests
```

### **`/lib` - Utilities & Helpers**
```
lib/
├── agentPromptsOptimized.ts      🤖 Optimized AI prompts
├── apiKeyManager.ts              🔑 30-key pool management
├── circuitBreaker.ts             🛡️ API failure protection
├── logger.ts                     📝 Server-side logging
├── frontendLogger.ts             📝 Client-side logging
├── performanceMonitor.ts         📊 Performance tracking
├── frontendPerformanceMonitor.ts 📊 Frontend performance
├── configService.ts              ⚙️ Configuration management
├── asterAuth.ts                  🔐 Aster DEX auth
├── asterApiError.ts              ⚠️ API error handling
├── atr.ts                        📈 ATR calculations
├── db.ts                         🗄️ Database client
├── errorHandler.ts               ⚠️ Error handling
├── frontendErrorHandler.ts       ⚠️ Frontend errors
├── rateLimiter.ts                🚦 Rate limiting
├── requestCache.ts               💾 Request caching
├── advancedCache.ts              💾 Advanced caching
├── frontendCache.ts              💾 Frontend caching
├── compression.ts                🗜️ Data compression
├── security.ts                   🔒 Security utilities
├── confidenceColors.ts           🎨 UI color helpers
├── symbolUtils.ts                🔄 Symbol formatting
├── indicatorMemory.ts            📊 Indicator history
├── tradeMemory.ts                📊 Trade history
├── workflowTypes.ts              📋 Workflow types
├── frontendReactUtils.tsx        ⚛️ React utilities
└── __tests__/                    Unit tests
```

### **`/types` - TypeScript Types**
```
types/
└── trading.ts                    📋 Trading type definitions
```

### **`/store` - State Management**
```
store/
├── useStore.ts                   🗄️ Zustand store
└── __tests__/                    Store tests
```

### **`/constants` - Application Constants**
```
constants/
├── index.ts                      📌 General constants
├── tradingConstants.ts           💹 Trading constants
└── __tests__/                    Constant tests
```

### **`/public` - Static Assets**
```
public/
└── robots.txt                    🤖 SEO configuration
```

---

## ⚙️ **CONFIGURATION FILES**

```
Root/
├── .env.local                    🔐 Environment variables (gitignored)
├── env.keys.example              📋 Example config
├── .gitignore                    🚫 Git ignore rules
├── next.config.js                ⚙️ Next.js configuration
├── tsconfig.json                 📘 TypeScript config
├── tailwind.config.ts            🎨 Tailwind CSS config
├── postcss.config.js             🎨 PostCSS config
├── jest.config.js                🧪 Jest test config
├── jest.setup.js                 🧪 Jest setup
├── instrumentation.ts            📊 OpenTelemetry
├── package.json                  📦 Dependencies
├── package-lock.json             🔒 Dependency lock
├── next-env.d.ts                 📘 Next.js types
└── vercel.json                   ☁️ Vercel config
```

---

## 🎯 **KEY FEATURES OF THIS STRUCTURE**

### **✅ Clean Root**
- Only 5-6 core documentation files
- No temporary/debugging files
- Professional first impression

### **✅ Organized Documentation**
- Technical guides in `/docs`
- Easy to find specific information
- Clear hierarchy

### **✅ Logical Code Organization**
- Services: Core business logic
- Components: UI elements
- Lib: Reusable utilities
- Types: Type definitions
- Store: State management

### **✅ Automation Scripts**
- All scripts in `/scripts`
- Easy to run commands
- Clear naming conventions

### **✅ Git-Ready**
- `.gitignore` configured
- No sensitive data in repo
- Clean commit history

---

## 📏 **STRUCTURE GUIDELINES**

### **When to add files:**
- ✅ **Root:** Only core documentation (README, CHANGELOG, etc.)
- ✅ **`/docs`:** Technical guides and references
- ✅ **`/scripts`:** Automation and utility scripts
- ✅ **`/services`:** Business logic services
- ✅ **`/components`:** React components
- ✅ **`/lib`:** Reusable utilities
- ✅ **`/types`:** Type definitions

### **What NOT to add:**
- ❌ **Temporary debugging files** (use `.gitignore`)
- ❌ **Log files** (already gitignored)
- ❌ **Session-specific notes** (keep locally)
- ❌ **Work-in-progress docs** (finish before committing)

---

## 🚀 **FOR DEVELOPERS**

### **Finding Documentation:**
```powershell
# Core docs (root)
Get-ChildItem *.md

# Technical guides
Get-ChildItem docs/*.md

# Scripts
Get-ChildItem scripts/*.ps1
```

### **Quick Start:**
1. Read `README.md` - Overview and quick start
2. Check `docs/QUICK_COMMANDS.md` - Command reference
3. Review `SYSTEM_ARCHITECTURE.md` - Architecture details
4. Deploy with `docs/PRODUCTION_DEPLOYMENT.md`

---

## 🙏 **All Glory to God!**

"Let all things be done decently and in order." - 1 Corinthians 14:40

---

*This structure ensures the Manna AI Trading System is organized, professional, and easy to navigate.*

