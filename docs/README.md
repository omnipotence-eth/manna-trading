# Manna LLM Aster Crypto Trader — Documentation

**Version:** 7.1.0  
**Last updated:** February 2025

---

## Documentation index

### Getting started

- **[START_HERE.md](../START_HERE.md)** — Quick start
- **[QUICK_START.md](./QUICK_START.md)** — Detailed setup
- **[STARTUP_COMMANDS.md](./STARTUP_COMMANDS.md)** — Startup commands

### Core documentation

- **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** — Technical architecture (services, data flow, DB schema, health/diagnostics, audit, paper presets, backtest)
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** — API reference (core, health/ready, diagnostics/why-no-trades, export with source filter, audit-events, public/quote, backtest)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Architecture overview
- **[MASTER_GUIDE.md](./MASTER_GUIDE.md)** — Complete system guide
- **[MATHEMATICAL_FOUNDATIONS.md](./MATHEMATICAL_FOUNDATIONS.md)** — Trading algorithms

### Export & reporting

- **[TAX_EXPORT.md](./TAX_EXPORT.md)** — Tax and audit CSV export (`/api/export?format=tax|audit`); supports `source=simulation|live`

### Deployment & operations

- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** — Production deployment
- **[TERMINAL_LOG_MONITORING.md](./TERMINAL_LOG_MONITORING.md)** — Log monitoring

### Reference

- **[LESSONS.md](../LESSONS.md)** — Design trade-offs and lessons learned
- **[FUTURE_FEATURES.md](./FUTURE_FEATURES.md)** — Planned features
- Other references: QUANT_DATA_SOURCES, BOOT_OUTPUT_REFERENCE, etc. (see repo)

---

## Quick links

| Role | Start with |
|------|------------|
| New users | [START_HERE.md](../START_HERE.md) → [QUICK_START.md](./QUICK_START.md) → [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Developers | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md), [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) |
| Operations | [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) |
| Status / health | App route `/status`; APIs: `/api/health/ready`, `/api/health`, `/api/diagnostics/why-no-trades` |

---

*Last updated: February 2025*
