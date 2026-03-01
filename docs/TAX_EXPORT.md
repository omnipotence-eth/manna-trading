# Tax export

Use the **tax export** to produce a CSV suitable for tax reporting, record-keeping, or portfolio reconciliation.

## Endpoint

```http
GET /api/export?format=tax&days=365&limit=1000
```

| Parameter | Description |
|-----------|-------------|
| `format=tax` | Tax-oriented CSV (date, symbol, side, cost basis, proceeds, P&L, notes). |
| `days` | Include trades from the last N days (default 30). |
| `limit` | Max rows (default 500, max 2000). |

## Columns

| Column    | Description |
|----------|-------------|
| date     | Trade date (YYYY-MM-DD) |
| symbol   | e.g. BTC/USDT |
| side     | LONG or SHORT |
| size     | Position size (contracts/units) |
| entryPrice | Entry price |
| exitPrice  | Exit price |
| costBasis | size × entryPrice (cost of position) |
| proceeds  | size × exitPrice (sale value) |
| pnl      | Realized P&L (USD) |
| fees     | Placeholder (0); add manually if you track fees |
| notes    | Entry and exit reasons (for your records) |

## Other formats

- **format=csv** – Full trade list (id, timestamp, model, entryReason, exitReason, duration, etc.).
- **format=audit** – “Why did we trade?” export: id, date, symbol, side, P&L, **why_entry**, **why_exit**.
- **format=json** – JSON with `trades` array and optional `stats`.

## Example

```bash
curl "https://your-app.vercel.app/api/export?format=tax&days=365" -o manna-tax-2025.csv
```

Open in Excel or Google Sheets for tax preparation or reconciliation. Consult a tax professional for reporting crypto trading in your jurisdiction.
