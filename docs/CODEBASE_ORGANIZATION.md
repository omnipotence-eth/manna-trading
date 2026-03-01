# Codebase Organization Guide

**Last Updated:** December 2025  
**Version:** 7.1.0

This guide explains how the codebase is organized and how to navigate it effectively.

---

## 📁 Directory Structure

### `/app` - Next.js Application
- **`app/page.tsx`** - Landing page (portfolio showcase)
- **`app/trading/page.tsx`** - Main trading dashboard
- **`app/api/`** - API routes (39 endpoints)
- **`app/layout.tsx`** - Root layout with fonts and initialization

### `/components` - React Components
- **`components/ui/`** - Reusable UI primitives (buttons, cards, etc.)
- **`components/NOF1Dashboard.tsx`** - Main trading dashboard
- **`components/InteractiveChart.tsx`** - Portfolio performance chart
- **`components/Positions.tsx`** - Open positions display
- **`components/AgentInsights.tsx`** - AI agent reasoning display
- **`components/GoalTracker.tsx`** - Trading goal progress
- **Other components** - Feature-specific components

### `/services` - Business Logic
Organized by domain:
- **`services/ai/`** - AI agent services
- **`services/exchange/`** - Exchange API integration
- **`services/trading/`** - Trading logic
- **`services/data/`** - Data aggregation
- **`services/ml/`** - Machine learning
- **`services/monitoring/`** - System monitoring

### `/lib` - Utilities & Helpers
- **`lib/hooks/`** - Custom React hooks
- **`lib/utils/`** - Utility functions
- **`lib/logger.ts`** - Logging system
- **`lib/errorHandler.ts`** - Error handling
- **`lib/configService.ts`** - Configuration

### `/constants` - Configuration Constants
- **`constants/index.ts`** - Main constants
- **`constants/tradingConstants.ts`** - Trading parameters
- **`constants/pollingIntervals.ts`** - Timing constants

### `/types` - TypeScript Types
- **`types/aster.ts`** - Aster DEX types
- **`types/trading.ts`** - Trading types

### `/store` - State Management
- **`store/useStore.ts`** - Zustand store

### `/docs` - Documentation
- **`docs/README.md`** - Documentation index
- **`docs/ARCHIVE/`** - Historical documentation

---

## 🎯 Finding Code

### By Feature

**Trading Logic:**
- Market scanning → `services/trading/marketScannerService.ts`
- Position monitoring → `services/trading/positionMonitorService.ts`
- Risk management → `services/ai/agentCoordinator.ts` (Risk Manager)

**AI Agents:**
- Agent coordination → `services/ai/agentCoordinator.ts`
- Agent runner → `services/ai/agentRunnerService.ts`
- DeepSeek integration → `services/ai/deepseekService.ts`

**Exchange Integration:**
- REST API → `services/exchange/asterDexService.ts`
- WebSocket → `services/exchange/websocketMarketService.ts`

**Data Processing:**
- Data aggregation → `services/data/unifiedDataAggregator.ts`
- API caching → `services/data/apiCache.ts`

### By Type

**API Routes:**
- All routes → `app/api/[endpoint-name]/route.ts`
- Follow pattern: GET/POST handlers with error handling

**React Components:**
- All components → `components/[ComponentName].tsx`
- Use `'use client'` for client components
- Use `frontendLogger` for logging

**Services:**
- All services → `services/[category]/[serviceName].ts`
- Use singleton pattern for Next.js compatibility

**Utilities:**
- Hooks → `lib/hooks/use[HookName].ts`
- Utils → `lib/utils/[utilityName].ts`
- Core → `lib/[utilityName].ts`

---

## 📝 Code Patterns

### Service Pattern
```typescript
// Singleton pattern for Next.js hot-reload compatibility
const globalForService = globalThis as typeof globalThis & {
  __myService?: MyService;
};

if (!globalForService.__myService) {
  globalForService.__myService = new MyService();
}

export const myService = globalForService.__myService;
```

### API Route Pattern
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';

export async function GET(request: NextRequest) {
  try {
    // Implementation
    return createSuccessResponse(data);
  } catch (error) {
    return handleApiError(error, 'Context');
  }
}
```

### Component Pattern
```typescript
'use client';

import { useState, useEffect } from 'react';
import { frontendLogger } from '@/lib/frontendLogger';

export default function MyComponent() {
  // Implementation with proper error handling
}
```

### Hook Pattern
```typescript
import { useState, useEffect } from 'react';

export function useMyHook() {
  // Implementation with cleanup
  return { data, loading, error };
}
```

---

## 🔍 Import Patterns

### Absolute Imports
Use `@/` prefix for all imports:
```typescript
import { logger } from '@/lib/logger';
import { useStore } from '@/store/useStore';
import MyComponent from '@/components/MyComponent';
```

### Service Imports
```typescript
// Static import for frequently used services
import { logger } from '@/lib/logger';

// Dynamic import for heavy services (optional optimization)
const { heavyService } = await import('@/services/heavy/heavyService');
```

### Utility Imports
```typescript
// From centralized utils
import { formatCurrency, formatPercent } from '@/lib/utils';
import { useApiPolling } from '@/lib/hooks';
```

---

## 🧹 Clean Codebase Rules

### Files to Keep
- ✅ All source code files (`.ts`, `.tsx`)
- ✅ Configuration files (`.json`, `.js`, `.config.*`)
- ✅ Active documentation (`.md` in `docs/`)
- ✅ Essential scripts (in `scripts/`)

### Files to Ignore (via .gitignore)
- ❌ Log files (`*.log`, `*-logs-*.txt`)
- ❌ Build artifacts (`*.tsbuildinfo`, `.next/`)
- ❌ Temporary files (`tmp/`, `data/`)
- ❌ Node modules (`node_modules/`)

### Naming Conventions
- **Components:** PascalCase (`MyComponent.tsx`)
- **Services:** camelCase (`myService.ts`)
- **Utilities:** camelCase (`myUtility.ts`)
- **Hooks:** camelCase with `use` prefix (`useMyHook.ts`)
- **Types:** PascalCase (`MyType.ts`)
- **Constants:** UPPER_SNAKE_CASE (`MY_CONSTANT`)

---

## 📚 Documentation Structure

### Active Documentation
- **Getting Started** - Quick start guides
- **Core Documentation** - System guides
- **Optimization** - Latest optimizations
- **Deployment** - Production guides
- **Reference** - API and technical reference

### Archived Documentation
- Historical audit files in `docs/ARCHIVE/`
- Kept for reference but not actively maintained

---

## 🚀 Quick Reference

### Common Tasks

**Add API endpoint:**
1. Create `app/api/[name]/route.ts`
2. Export GET/POST handlers
3. Use `handleApiError` and `createSuccessResponse`

**Add component:**
1. Create `components/[Name].tsx`
2. Use `'use client'` if needed
3. Use `frontendLogger` for logging

**Add service:**
1. Create `services/[category]/[name].ts`
2. Use singleton pattern
3. Export singleton instance

**Add utility:**
1. Create in appropriate `lib/` subdirectory
2. Export from `lib/[subdir]/index.ts`
3. Document usage

---

## ✅ Codebase Status

- ✅ **Clean** - No unnecessary files
- ✅ **Organized** - Clear structure
- ✅ **Documented** - Comprehensive guides
- ✅ **Type-safe** - Full TypeScript coverage
- ✅ **Professional** - Production-ready

---

**Last Updated:** December 2025

