# Manna LLM Aster Crypto Trader — Documentation

**Version:** 7.1.0  
**Last updated:** February 2025

---

## Documentation index

### Getting started

- **[README.md](../README.md)** — Project overview and quick start
- **[QUICK_START.md](./QUICK_START.md)** — Detailed setup

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
### Reference

- **[LESSONS.md](../LESSONS.md)** — Design trade-offs and lessons learned
- **[FUTURE_FEATURES.md](./FUTURE_FEATURES.md)** — Planned features
- **[QUANT_DATA_SOURCES.md](./QUANT_DATA_SOURCES.md)** — Quantitative data sources
- **[AI_MODELS_REFERENCE.md](./AI_MODELS_REFERENCE.md)** — AI model configuration

---

## Quick links

| Role | Start with |
|------|------------|
| New users | [README.md](../README.md) → [QUICK_START.md](./QUICK_START.md) → [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Developers | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md), [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) |
| Operations | [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) |
| Status / health | App route `/status`; APIs: `/api/health/ready`, `/api/health`, `/api/diagnostics/why-no-trades` |

---

*Last updated: February 2025*
