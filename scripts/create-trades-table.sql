-- Create trades table for trade history logging
CREATE TABLE IF NOT EXISTS trades (
  id VARCHAR(255) PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  model VARCHAR(100) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  size DECIMAL(20, 8) NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8) DEFAULT 0,
  pnl DECIMAL(20, 8) DEFAULT 0,
  pnl_percent DECIMAL(10, 4) DEFAULT 0,
  leverage INTEGER NOT NULL DEFAULT 1,
  entry_reason TEXT,
  entry_confidence DECIMAL(5, 4),
  entry_signals JSONB,
  entry_market_regime VARCHAR(50),
  entry_score INTEGER,
  exit_reason TEXT,
  exit_timestamp TIMESTAMPTZ,
  duration INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_pnl ON trades(pnl);
CREATE INDEX IF NOT EXISTS idx_trades_exit_timestamp ON trades(exit_timestamp);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_trades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trades_updated_at_trigger ON trades;
CREATE TRIGGER trades_updated_at_trigger
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_trades_updated_at();
