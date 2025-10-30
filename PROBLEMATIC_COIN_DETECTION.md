# PROBLEMATIC COIN DETECTION & BLACKLISTING

## Issue Analysis

### COSMO Coin Issues
- **Problem:** Consistent $4 loss on every trade
- **Root Cause:** Likely low liquidity causing:
  - Wide bid-ask spreads (slippage on entry/exit)
  - Inability to exit positions at desired prices
  - Execution problems similar to APEUSDT

### APEUSDT Issues
- **Problem:** Had to write script to sell (can't exit normally)
- **Root Cause:** 
  - Low liquidity / wide spreads
  - Order book depth issues
  - Exchange execution problems

---

## Solution Implemented

### 1. **Manual Blacklist**
Added COSMO to blacklist:
```typescript
blacklistedSymbols: [
  'APEUSDT',
  'APE/USDT',
  'ATOMUSDT',
  'ATOM/USDT',
  'COSMOUSDT',
  'COSMO/USDT',
  'COSMO'
]
```

### 2. **Automatic Problematic Coin Detection**
Created `ProblematicCoinDetector` service that automatically detects coins with:
- **Low Quote Volume:** <$500K daily volume
- **Low Liquidity Score:** <0.3 (can't exit positions)
- **Wide Spreads:** >0.5% (execution problems)
- **Order Book Issues:** Insufficient depth for exits

### 3. **Market Scanner Filters** (Multi-Layer Protection)

**Layer 1: Pre-Analysis Filter**
- Rejects coins with quote volume <$500K BEFORE analysis
- Rejects coins with spread >2% BEFORE analysis

**Layer 2: Liquidity Check**
- Rejects coins with liquidity score <0.25 (returns null)
- Prevents COSMO/APE-like coins from being analyzed

**Layer 3: Order Book Validation**
- Rejects coins with order book liquidity <0.3
- Rejects coins with spread >0.5% (execution problems)

**Layer 4: Agent Runner Filter**
- Enforces minimum $500K quote volume
- Enforces maximum 0.5% spread
- Only trades coins with high liquidity + tight spreads

**Layer 5: Problematic Coin Detector**
- Checks each opportunity against detected problematic coins
- Auto-detects and flags problematic coins during scan

---

## Detection Criteria

A coin is considered **PROBLEMATIC** if ANY of these conditions are met:

1. **Quote Volume < $500K**
   - Reason: Insufficient liquidity for proper execution
   - Impact: Can't enter/exit positions cleanly

2. **Liquidity Score < 0.3**
   - Reason: Order book too thin
   - Impact: High slippage, can't exit positions

3. **Spread > 0.5%**
   - Reason: Wide bid-ask spread
   - Impact: Immediate loss on entry, difficult to exit

4. **24h Spread > 2%**
   - Reason: Extreme price volatility/illiquidity
   - Impact: Execution problems, unpredictable fills

---

## Protection Layers

### **Layer 1: Config Blacklist** ✅
- Hard-coded blacklist (COSMO, APE, ATOM)
- Checked first in market scanner

### **Layer 2: Problematic Coin Detector** ✅
- Automatic detection during market scans
- Stores detected problematic coins in memory
- Checked before analyzing opportunities

### **Layer 3: Market Scanner Pre-Filters** ✅
- Rejects low-volume coins BEFORE analysis
- Rejects wide-spread coins BEFORE analysis
- Saves API calls and processing time

### **Layer 4: Market Scanner Liquidity Check** ✅
- Rejects coins with liquidity <0.25 (returns null)
- Prevents low-liquidity coins from being opportunities

### **Layer 5: Order Book Validation** ✅
- Checks order book depth and spread
- Rejects coins with execution problems
- Validates BEFORE returning opportunity

### **Layer 6: Agent Runner Filters** ✅
- Final filter before trading
- Enforces $500K quote volume minimum
- Enforces 0.5% spread maximum

### **Layer 7: Risk Manager Prompt** ✅
- LLM instructed to reject low-liquidity coins
- Explicitly mentions COSMO/APE as examples
- Quality filters in assessment template

---

## API Endpoints

### **GET /api/problematic-coins**
Returns list of detected problematic coins:
```json
{
  "success": true,
  "count": 5,
  "coins": [
    {
      "symbol": "COSMOUSDT",
      "reason": "Low quote volume: $250K < $500K minimum",
      "metrics": {
        "quoteVolume24h": 250000,
        "liquidityScore": 0.05,
        "spreadPercent": 1.2,
        "avgSpread": 1.1
      }
    }
  ]
}
```

### **POST /api/problematic-coins/scan**
Scans all symbols and detects problematic coins:
```bash
curl -X POST http://localhost:3000/api/problematic-coins/scan
```

---

## Expected Behavior

### **COSMO Coin**
- ✅ **Blacklisted** in config (hard-coded)
- ✅ **Filtered** by market scanner (quote volume check)
- ✅ **Rejected** by order book validation (liquidity check)
- ✅ **Blocked** by Agent Runner filters (spread check)
- ✅ **Never traded** - multiple layers of protection

### **Similar Coins**
Any coin with similar characteristics will be automatically detected and blocked:
- Low quote volume (<$500K)
- Wide spreads (>0.5%)
- Low liquidity score (<0.3)
- Order book depth issues

---

## Testing

To test problematic coin detection:

1. **Check current blacklist:**
   ```bash
   curl http://localhost:3000/api/problematic-coins
   ```

2. **Scan for problematic coins:**
   ```bash
   curl -X POST http://localhost:3000/api/problematic-coins/scan
   ```

3. **Verify COSMO is blocked:**
   - Check logs for "Skipping blacklisted symbol: COSMO"
   - Check logs for "Skipping problematic coin: COSMO"
   - Verify no COSMO trades are executed

---

## Why COSMO Lost $4 Every Trade

**Likely Causes:**
1. **Wide Spreads:** Bid-ask spread >0.5% means immediate loss on entry
2. **Slippage:** Low liquidity causes fills at worse prices
3. **Exit Problems:** Can't exit at desired price (similar to APEUSDT)
4. **Order Book Depth:** Insufficient depth for clean execution

**Example:**
- Entry: $10.00 (bid)
- Exit needed: $10.00 (ask)
- Actual exit: $9.96 (due to spread/slippage)
- **Loss: $4 on $100 position (4%)**

With new filters:
- ✅ COSMO won't be analyzed (low volume filter)
- ✅ COSMO won't pass liquidity check (<0.25)
- ✅ COSMO won't pass spread check (>0.5%)
- ✅ COSMO won't be traded (multiple rejections)

---

## Summary

**Problem:** COSMO and APEUSDT cause losses due to execution issues

**Solution:** 
1. ✅ Added COSMO to blacklist
2. ✅ Created automatic problematic coin detector
3. ✅ Added 7 layers of protection
4. ✅ Strict liquidity/spread filters
5. ✅ API endpoint to scan for problematic coins

**Result:** Similar coins will be automatically detected and blocked before trading

---

*Updated: 2025-01-30*
*Protection Layers: 7*
*Detection Criteria: 4*

