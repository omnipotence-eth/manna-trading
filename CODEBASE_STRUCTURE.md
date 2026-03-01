# Codebase Structure

**Manna LLM Aster Crypto Trader** — Version 7.1.0

A concise guide to the repository layout and where to find or add code.

---

## Directory Structure

```
manna-llm-aster-crypto-trader/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (~40 endpoints)
│   │   ├── startup/
│   │   ├── trading-status/
│   │   ├── realtime-market/
│   │   ├── positions/
│   │   ├── agent-runner/
│   │   ├── cron/                 # cron/trading-cycle (serverless trading cycle)
│   │   ├── aster/                # account, positions, leverage, order, exchange-info
│   │   ├── agents/
│   │   ├── health/
│   │   ├── diagnostics/
│   │   └── ...
│   ├── page.tsx                  # Landing / portfolio page
│   ├── trading/
│   │   └── page.tsx              # Main trading dashboard
│   ├── whitepaper/
│   │   └── page.tsx
│   └── layout.tsx
│
├── components/                   # React components
│   ├── ui/                       # Reusable UI (e.g. LoadingSpinner)
│   ├── NOF1Dashboard.tsx         # Main trading dashboard
│   ├── InteractiveChart.tsx
│   ├── Positions.tsx
│   ├── AgentInsights.tsx
│   ├── SiteHeader.tsx
│   ├── ErrorBoundary.tsx
│   ├── StartupInitializer.tsx
│   └── ...
│
├── services/                     # Core business logic (singletons)
│   ├── ai/
│   │   ├── agentCoordinator.ts
│   │   ├── agentRunnerService.ts
│   │   └── deepseekService.ts
│   ├── exchange/
│   │   ├── asterDexService.ts
│   │   └── websocketMarketService.ts
│   ├── trading/
│   │   ├── marketScannerService.ts
│   │   ├── positionMonitorService.ts
│   │   ├── mathematicalTradingSystem.ts
│   │   ├── goalTracker.ts
│   │   ├── simulationService.ts
│   │   └── ...
│   ├── ml/
│   │   ├── mlDataCollector.ts
│   │   ├── mlTrainingDataService.ts
│   │   ├── rlTrainingService.ts
│   │   └── ...
│   └── monitoring/
│       ├── startupService.ts
│       ├── healthMonitorService.ts
│       ├── performanceTracker.ts
│       └── ...
│
├── lib/                          # Shared utilities and config
│   ├── hooks/                    # useApiPolling, useDebounce, useLocalStorage
│   ├── utils/                    # formatting, validation, async, cn
│   ├── logger.ts
│   ├── errorHandler.ts
│   ├── configService.ts
│   ├── requestCache.ts
│   ├── frontendCache.ts
│   ├── circuitBreaker.ts
│   ├── db.ts
│   ├── db.ts
│   ├── workflowTypes.ts
│   ├── agentPrompts.ts
│   ├── notificationService.ts    # Discord/webhook trade alerts
│   └── ...
│
├── constants/
│   ├── index.ts
│   ├── tradingConstants.ts
│   └── pollingIntervals.ts
│
├── types/
│   ├── trading.ts
│   └── aster.ts
│
├── store/
│   └── useStore.ts               # Zustand store
│
├── docs/
│   ├── README.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── ARCHITECTURE.md            # High-level architecture overview
│   ├── API_DOCUMENTATION.md
│   └── ARCHIVE/
│
├── scripts/
│   ├── preload-model.mjs
│   ├── collectErrors.js
│   └── ...
│
├── public/
│   ├── robots.txt
│   └── sw.js
│
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── instrumentation.ts            # Server startup / env validation
└── .gitignore
```

---

## Key Files by Purpose

| Purpose        | Location |
|----------------|----------|
| Entry points   | `app/page.tsx`, `app/trading/page.tsx`, `instrumentation.ts` |
| Agent pipeline | `services/ai/agentCoordinator.ts`, `services/ai/agentRunnerService.ts` |
| Exchange API   | `services/exchange/asterDexService.ts` |
| Configuration  | `lib/configService.ts`, `constants/tradingConstants.ts`, `constants/pollingIntervals.ts` |
| Logging        | `lib/logger.ts`, `lib/frontendLogger.ts` |
| Notifications  | `lib/notificationService.ts` (trade open/close alerts via Discord or webhook) |
| Errors         | `lib/errorHandler.ts`, `lib/frontendErrorHandler.ts` |
| State          | `store/useStore.ts` |
| Types          | `types/trading.ts`, `types/aster.ts`, `lib/workflowTypes.ts` |

---

## Module Organization

- **Services** — Domain-based: `ai/`, `exchange/`, `trading/`, `ml/`, `monitoring/`. Each service is a singleton.
- **Lib** — Cross-cutting: hooks, utils, logger, config, caches, circuit breaker, DB client.
- **Components** — Feature UI in `components/`; shared primitives in `components/ui/`.

---

## Finding Code

| Need              | Look in            |
|-------------------|--------------------|
| Trading logic     | `services/trading/` |
| AI / agents       | `services/ai/`      |
| Exchange / WebSocket | `services/exchange/` |
| ML / RL           | `services/ml/`     |
| Health / startup  | `services/monitoring/` |
| API routes        | `app/api/`         |
| React components  | `components/`      |
| Utilities         | `lib/`, `lib/utils/`, `lib/hooks/` |
| Types             | `types/`, `lib/workflowTypes.ts`   |

---

## Conventions

### Services

Singletons attached to `globalThis` for Next.js hot reload:

```typescript
const globalForService = globalThis as typeof globalThis & { __myService?: MyService };
if (!globalForService.__myService) {
  globalForService.__myService = new MyService();
}
export const myService = globalForService.__myService;
```

### API Routes

Consistent error handling and response shape:

```typescript
export async function GET(request: NextRequest) {
  try {
    // ...
    return createSuccessResponse(data);
  } catch (error) {
    return handleApiError(error, 'RouteName');
  }
}
```

### Client Components

Use `'use client'` and shared logging when needed:

```typescript
'use client';
import { frontendLogger } from '@/lib/frontendLogger';
```

---

## Documentation

| Document | Description |
|----------|-------------|
| `README.md` | Project overview and setup |
| `START_HERE.md` | Quick start |
| `LESSONS.md` | Design trade-offs and lessons learned |
| `docs/ARCHITECTURE.md` | Architecture overview |
| `docs/SYSTEM_ARCHITECTURE.md` | Detailed system design |
| `docs/API_DOCUMENTATION.md` | API reference |
| `docs/TAX_EXPORT.md` | Tax and audit export (CSV) |
| `docs/MASTER_GUIDE.md` | Full operational guide |

---

*Last updated: February 2025 | Version: 7.1.0*
