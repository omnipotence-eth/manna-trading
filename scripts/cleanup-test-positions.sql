-- Clean up all TEST positions from open_positions table
DELETE FROM open_positions WHERE symbol LIKE '%TEST%';

-- Verify cleanup
SELECT COUNT(*) as remaining_test_positions FROM open_positions WHERE symbol LIKE '%TEST%';

