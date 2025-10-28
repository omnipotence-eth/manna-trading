-- Position Monitoring Database Tables
-- Run this script to create tables for position tracking

-- Table for open positions being monitored
CREATE TABLE IF NOT EXISTS open_positions (
  id VARCHAR(255) PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8) NOT NULL,
  size DECIMAL(20, 8) NOT NULL,
  leverage INTEGER NOT NULL,
  stop_loss DECIMAL(20, 8) NOT NULL,
  take_profit DECIMAL(20, 8) NOT NULL,
  trailing_stop_percent DECIMAL(5, 2) DEFAULT 0,
  highest_price DECIMAL(20, 8) NOT NULL,
  lowest_price DECIMAL(20, 8) NOT NULL,
  unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
  unrealized_pnl_percent DECIMAL(10, 4) DEFAULT 0,
  opened_at BIGINT NOT NULL,
  last_checked BIGINT NOT NULL,
  order_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for closed positions (historical)
CREATE TABLE IF NOT EXISTS closed_positions (
  id VARCHAR(255) PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8) NOT NULL,
  size DECIMAL(20, 8) NOT NULL,
  leverage INTEGER NOT NULL,
  stop_loss DECIMAL(20, 8),
  take_profit DECIMAL(20, 8),
  realized_pnl DECIMAL(20, 8) NOT NULL,
  realized_pnl_percent DECIMAL(10, 4) NOT NULL,
  opened_at BIGINT NOT NULL,
  closed_at BIGINT NOT NULL,
  exit_reason VARCHAR(50) NOT NULL,
  order_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_open_positions_symbol ON open_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_open_positions_status ON open_positions(status);
CREATE INDEX IF NOT EXISTS idx_closed_positions_symbol ON closed_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_closed_positions_closed_at ON closed_positions(closed_at);
CREATE INDEX IF NOT EXISTS idx_closed_positions_exit_reason ON closed_positions(exit_reason);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_open_positions_updated_at BEFORE UPDATE ON open_positions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON open_positions TO your_app_user;
-- GRANT SELECT, INSERT ON closed_positions TO your_app_user;

-- Verification queries
SELECT 'open_positions table created' as status;
SELECT 'closed_positions table created' as status;
SELECT 'Indexes created' as status;

