-- Fix entry_confidence column to accept percentage values (0-100)
ALTER TABLE trades 
ALTER COLUMN entry_confidence TYPE DECIMAL(5, 2);

-- Update any existing trades with decimal confidence (0-1) to percentage (0-100)
UPDATE trades 
SET entry_confidence = entry_confidence * 100
WHERE entry_confidence < 1;

