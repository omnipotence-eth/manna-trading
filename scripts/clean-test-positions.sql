-- Clean up invalid test positions
-- Run this to remove TEST/USDT and other invalid positions

-- Show current positions first
SELECT id, symbol, side, status, opened_at 
FROM open_positions 
WHERE symbol LIKE '%TEST%' OR symbol NOT LIKE '%USDT';

-- Delete invalid test positions
DELETE FROM open_positions 
WHERE symbol LIKE '%TEST%' 
   OR symbol NOT IN (
     SELECT DISTINCT symbol FROM trades WHERE symbol LIKE '%USDT'
   );

-- Verify cleanup
SELECT id, symbol, side, status FROM open_positions;

