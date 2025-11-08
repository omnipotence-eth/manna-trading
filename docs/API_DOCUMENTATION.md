# API Documentation

Complete reference for all trading system API endpoints.

## Base URL

All endpoints are prefixed with:
- **Development**: `http://localhost:3000/api`
- **Production**: `https://your-domain.com/api`

---

## 🔧 System Management

### Startup & Initialization

#### `GET /api/startup?action=status`
Get initialization status of the trading system.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": {
      "initialized": true,
      "timestamp": "2025-11-02T04:48:26.794Z"
    }
  }
}
```

#### `GET /api/startup?action=initialize`
Manually initialize all trading services.

**Timeout:** Up to 130 seconds (model loading can take 60-120 seconds)

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Services Initialized",
    "timestamp": "2025-11-02T04:52:06.000Z"
  }
}
```

**Notes:**
- Requires DeepSeek R1 to be available
- Will fail if Ollama is not running or model not loaded
- First request may take 60-120 seconds for model loading

#### `GET /api/startup?action=shutdown`
Shutdown all trading services gracefully.

---

### Health Checks

#### `GET /api/health`
Quick health check of the system.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-02T04:39:29.017Z",
  "hasApiKey": true
}
```

#### `GET /api/health/detailed`
Comprehensive health check with detailed component status.

---

## 🤖 AI & DeepSeek R1

### `GET /api/multi-agent?action=test-deepseek`
Test DeepSeek R1 connection and availability.

**Timeout:** Up to 150 seconds (first request may take 60-120 seconds)

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "DeepSeek R1 Connection Test",
    "connected": true,
    "timestamp": "2025-11-02T04:51:09.918Z"
  }
}
```

**Error Response:**
```json
{
  "success": true,
  "data": {
    "connected": false,
    "error": "DeepSeek R1 is not available. Check if Ollama is running and model is loaded. First request may take 60-120 seconds to load model (18.9GB model)."
  }
}
```

**Other Actions:**
- `GET /api/multi-agent?action=status` - Get system status
- `GET /api/multi-agent?action=models` - Get available models
- `GET /api/multi-agent?action=agents` - Get agent status
- `GET /api/multi-agent?action=workflows` - Get workflow status
- `GET /api/multi-agent?action=metrics` - Get performance metrics
- `GET /api/multi-agent?action=start&symbol=BTC/USDT` - Start trading workflow

---

## 📊 Trading & Market Data

### `GET /api/trading/data`
Get current trading data including balance, positions, and total value.

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": 100,
    "positions": [],
    "totalValue": 100,
    "unrealizedPnL": 0,
    "timestamp": "2025-11-02T04:41:02.000Z"
  }
}
```

### `GET /api/optimized-data`
Get optimized market data for trading decisions.

**Query Parameters:**
- `limit` (optional): Number of symbols to return (default: 50)
- `minVolume` (optional): Minimum 24h volume filter
- `maxSpread` (optional): Maximum spread filter

**Response:**
```json
{
  "success": true,
  "data": {
    "symbols": [...],
    "topByVolume": [...],
    "timestamp": "2025-11-02T04:41:02.000Z"
  }
}
```

### `POST /api/optimized-data`
Submit optimized trading parameters.

**Request Body:**
```json
{
  "confidenceThreshold": 0.35,
  "minScore": 35,
  "maxPositionSize": 10
}
```

---

## 🔄 Agent Runner (24/7 Trading)

### `GET /api/agent-runner?action=status`
Get status of the 24/7 agent runner.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Agent Runner Status",
    "status": {
      "isRunning": true,
      "timestamp": "2025-11-02T04:40:55.276Z",
      "activeWorkflowCount": 1
    }
  }
}
```

**Other Actions:**
- `GET /api/agent-runner?action=force-run` - Force immediate market scan
- `GET /api/agent-runner?action=update-symbols` - Update trading symbols
- `GET /api/agent-runner?action=config` - Get configuration

### `POST /api/agent-runner/start`
Start the agent runner service.

### `POST /api/agent-runner/stop`
Stop the agent runner service.

---

## 💼 Positions & Account

### `GET /api/aster/account`
Get account information from Aster DEX.

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": 83.86518784,
    "availableBalance": 83.86518784,
    "totalEquity": 83.86518784
  }
}
```

### `GET /api/aster/positions`
Get open positions from Aster DEX.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTC/USDT",
      "side": "LONG",
      "size": 0.001,
      "entryPrice": 45000,
      "unrealizedPnl": 5.5
    }
  ]
}
```

### `GET /api/positions`
Get positions from database.

**Query Parameters:**
- `status` (optional): Filter by status (`OPEN`, `CLOSED`)
- `symbol` (optional): Filter by symbol

### `POST /api/positions`
Manage positions (force close, update trailing stop).

**Request Body:**
```json
{
  "action": "force-close",
  "symbol": "BTC/USDT"
}
```

---

## 📈 Trading History

### `GET /api/trades`
Get trade history.

**Query Parameters:**
- `days` (optional): Number of days to look back (default: 30)
- `limit` (optional): Maximum number of trades to return

**Response:**
```json
{
  "success": true,
  "data": {
    "trades": [...],
    "stats": {
      "totalTrades": 10,
      "winRate": 0.7,
      "totalPnL": 15.5
    }
  }
}
```

### `POST /api/trades`
Add a new trade record.

---

## 📊 Market Analysis

### `GET /api/agent-insights`
Get AI agent insights and market opportunities.

**Query Parameters:**
- `limit` (optional): Number of insights to return (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "opportunities": [...],
    "topByVolume": [...],
    "timestamp": "2025-11-02T04:41:02.000Z"
  }
}
```

### `GET /api/market-confidence`
Get market confidence analysis and statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "avgConfidence": 0.65,
    "confidenceDistribution": {...},
    "avgScore": 45.2
  }
}
```

### `GET /api/prices`
Get current prices for trading symbols.

**Query Parameters:**
- `symbols` (optional): Comma-separated list of symbols

---

## ⚙️ Configuration & Setup

### `POST /api/setup/database`
Initialize database schema.

---

## 🎯 Performance Metrics

### `GET /api/performance`
Get trading performance metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "winRate": 0.7,
    "profitFactor": 1.5,
    "sharpeRatio": 1.2,
    "maxDrawdown": 5.0,
    "totalPnL": 15.5
  }
}
```

---

## 🔑 Order Management

### `POST /api/aster/order`
Place an order on Aster DEX.

**Request Body:**
```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "type": "MARKET",
  "quantity": 0.001
}
```

### `DELETE /api/aster/order`
Cancel an order.

**Query Parameters:**
- `symbol`: Trading symbol
- `orderId`: Order ID to cancel

### `POST /api/aster/leverage`
Set leverage for a symbol.

**Request Body:**
```json
{
  "symbol": "BTCUSDT",
  "leverage": 2
}
```

---

## 📝 AI Chat & Messages

### `GET /api/model-message`
Get AI model messages and chat logs.

**Query Parameters:**
- `hoursAgo` (optional): How many hours back to fetch (default: 168 = 7 days)
- `limit` (optional): Maximum messages to return

### `POST /api/model-message`
Add a new model message.

---

## ⚠️ Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message",
  "type": "ERROR_TYPE",
  "context": "Context",
  "timestamp": "2025-11-02T04:52:06.000Z"
}
```

**Common Error Types:**
- `TIMEOUT_ERROR` - Request timed out
- `EXTERNAL_API_ERROR` - External API call failed
- `VALIDATION_ERROR` - Invalid request parameters
- `INTERNAL_ERROR` - Internal server error

---

## 🚀 Optimization Endpoints

### Key Endpoints for Optimization:

1. **`GET /api/optimized-data`** - Get optimized market data
   - Use this to get pre-filtered, high-quality trading opportunities
   - Includes volume, spread, and liquidity filters

2. **`POST /api/optimized-data`** - Submit optimization parameters
   - Adjust confidence thresholds
   - Update scoring criteria
   - Modify position sizing rules

3. **`GET /api/market-confidence`** - Analyze market confidence
   - Get confidence distribution
   - Understand market conditions
   - Identify optimal trading windows

4. **`GET /api/performance`** - Track performance metrics
   - Monitor win rate
   - Track profit factor
   - Analyze Sharpe ratio

5. **`GET /api/agent-insights`** - Get AI-generated insights
   - View AI agent recommendations
   - See filtered opportunities
   - Understand decision rationale

---

## 📚 Additional Resources

- **Trading Diagnostic**: See `TRADING_DIAGNOSTIC.md`
- **Start Guide**: See `SIMPLE_START_GUIDE.md`
- **Quick Commands**: See `QUICK_COMMANDS.md`
- **Initialization Issues**: See `INITIALIZATION_PROBLEM_ANALYSIS.md`

---

## 🔐 Authentication

Currently, the API uses environment variables for authentication:
- `ASTER_API_KEY` - Aster DEX API key
- `ASTER_SECRET_KEY` - Aster DEX secret key

These are configured in `.env` file and are server-side only.

---

## ⏱️ Timeout Notes

**Important:** Some endpoints have extended timeouts due to DeepSeek R1 model loading:

- **Initialization**: Up to 130 seconds
- **DeepSeek Test**: Up to 150 seconds
- **First Model Request**: 60-120 seconds (normal for 18.9GB model)

Subsequent requests are much faster (1-5 seconds) once the model is loaded.

