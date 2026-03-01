# 📐 Mathematical Foundations

**Manna LLM Aster Crypto Trader v7.1.0**

Complete mathematical reference for all trading algorithms.

---

## 📋 Table of Contents

- [Position Sizing](#position-sizing)
- [Risk Metrics](#risk-metrics)
- [Stop-Loss & Take-Profit](#stop-loss--take-profit)
- [Market Regime Detection](#market-regime-detection)
- [Performance Metrics](#performance-metrics)
- [Monte Carlo Simulation](#monte-carlo-simulation)

---

## 📊 Position Sizing

### Kelly Criterion

The Kelly Criterion provides the mathematically optimal fraction of capital to risk on each trade.

#### Full Kelly Formula

```
f* = (bp - q) / b
```

Where:
- `f*` = Optimal fraction to bet
- `b` = Win/loss ratio (average win / average loss)
- `p` = Probability of winning
- `q` = Probability of losing (1 - p)

#### Example

```
Given:
- Win rate: 55% (p = 0.55)
- Average win: $100
- Average loss: $60
- b = 100/60 = 1.667

f* = (1.667 × 0.55 - 0.45) / 1.667
f* = (0.917 - 0.45) / 1.667
f* = 0.467 / 1.667
f* = 0.28 (28% of capital)
```

#### Fractional Kelly

Full Kelly is mathematically optimal but practically too aggressive. We use **15% of Kelly**:

```
Position Size = Full Kelly × 0.15
```

For the example above:
```
Position Size = 28% × 0.15 = 4.2% of capital
```

#### Implementation

```typescript
// lib/kellyCriterion.ts
export function calculateFullKelly(winRate: number, winLossRatio: number): number {
  const p = winRate;
  const q = 1 - p;
  const b = winLossRatio;
  
  const kelly = (b * p - q) / b;
  return Math.max(0, Math.min(1, kelly));
}
```

### Optimal F

Ralph Vince's extension of Kelly that maximizes the geometric mean return:

```
Optimal F = argmax Σ ln(1 + f × Ri / |Rmax|)
```

Where:
- `Ri` = Return of trade i
- `Rmax` = Largest loss
- `f` = Fraction being tested

This is solved iteratively by testing f values from 0.01 to 1.0.

### Account Size Adjustments

| Account Size | Max Position | Max Leverage | Reasoning |
|--------------|-------------|--------------|-----------|
| < $100 | 3% | 10x | Capital preservation critical |
| $100-$500 | 5% | 20x | Allow growth with safety |
| $500-$2000 | 8% | 30x | Standard risk tolerance |
| > $2000 | 12% | 50x | Sophisticated risk management |

---

## 📉 Risk Metrics

### Sharpe Ratio

Measures risk-adjusted return (excess return per unit of volatility).

```
Sharpe Ratio = (Rp - Rf) / σp
```

Where:
- `Rp` = Portfolio return (annualized)
- `Rf` = Risk-free rate (typically 5%)
- `σp` = Portfolio standard deviation (annualized)

#### Annualization

```
Annualized Return = Daily Return × 365
Annualized Volatility = Daily Volatility × √365
```

#### Interpretation

| Sharpe | Rating |
|--------|--------|
| < 0 | Bad (losing money) |
| 0-1 | Poor |
| 1-2 | Adequate |
| 2-3 | Good |
| > 3 | Excellent |

### Sortino Ratio

Like Sharpe, but only considers downside volatility:

```
Sortino Ratio = (Rp - Rf) / σd
```

Where `σd` is the standard deviation of negative returns only.

This is more appropriate for trading because we don't penalize upside volatility.

### Calmar Ratio

Return divided by maximum drawdown:

```
Calmar Ratio = Annualized Return / Maximum Drawdown
```

This tells you how much return you get per unit of worst-case risk.

### Profit Factor

Ratio of gross wins to gross losses:

```
Profit Factor = Σ Winning Trades / |Σ Losing Trades|
```

| Profit Factor | Interpretation |
|---------------|----------------|
| < 1 | Losing system |
| 1-1.5 | Marginal |
| 1.5-2 | Good |
| > 2 | Excellent |

### Expected Value

Expected profit per trade:

```
EV = (Win% × Avg Win) - (Loss% × Avg Loss)
```

A positive EV is required for profitability. We target EV > 0.5% per trade.

---

## 🎯 Stop-Loss & Take-Profit

### ATR-Based Stops

The Average True Range (ATR) measures volatility. We use it to set dynamic stops.

#### True Range Calculation

```
TR = max(High - Low, |High - Prev Close|, |Low - Prev Close|)
ATR(n) = SMA(TR, n)  // Usually n=14
```

#### Stop-Loss Distance

```
Stop Distance = ATR × Multiplier
```

| Volatility | Multiplier | Min Stop |
|------------|------------|----------|
| Low (< 2%) | 2.0 | 2% |
| Medium (2-5%) | 2.5 | 3% |
| High (5-10%) | 3.0 | 4% |
| Extreme (> 10%) | 3.5 | 5% |

#### Implementation

```typescript
// lib/atr.ts
export function getATRBasedLevels(
  entryPrice: number,
  side: 'LONG' | 'SHORT',
  atrPercent: number,
  multiplier: { stopLoss: number; takeProfit: number }
): { stopLoss: number; takeProfit: number } {
  const stopDistance = atrPercent * multiplier.stopLoss;
  const tpDistance = atrPercent * multiplier.takeProfit;
  
  if (side === 'LONG') {
    return {
      stopLoss: entryPrice * (1 - stopDistance / 100),
      takeProfit: entryPrice * (1 + tpDistance / 100)
    };
  } else {
    return {
      stopLoss: entryPrice * (1 + stopDistance / 100),
      takeProfit: entryPrice * (1 - tpDistance / 100)
    };
  }
}
```

### Chandelier Exit

Volatility-adaptive trailing stop:

```
LONG:  Chandelier Stop = Highest High(n) - 3 × ATR(n)
SHORT: Chandelier Stop = Lowest Low(n) + 3 × ATR(n)
```

This stop moves up (for longs) as price makes new highs, but only trails down when price drops below the ATR-adjusted level.

#### Why 3× ATR?

- 1× ATR: Too tight, stopped out by noise
- 2× ATR: Reasonable but still gets hit often
- 3× ATR: Sweet spot - filters noise, catches trends
- 4× ATR: Too loose, gives back too much profit

### Risk/Reward Ratio

```
R:R = Expected Reward / Expected Risk
R:R = (Take Profit - Entry) / (Entry - Stop Loss)
```

#### Minimum R:R by Win Rate

| Win Rate | Min R:R for Profit |
|----------|-------------------|
| 40% | 1.5:1 |
| 50% | 1.0:1 |
| 55% | 0.82:1 |
| 60% | 0.67:1 |

We target 2:1 minimum to provide margin of safety.

---

## 📈 Market Regime Detection

### ADX (Average Directional Index)

Measures trend strength (not direction):

```
+DI = 100 × EMA(+DM) / ATR
-DI = 100 × EMA(-DM) / ATR
DX = 100 × |+DI - -DI| / (+DI + -DI)
ADX = EMA(DX, 14)
```

| ADX | Regime |
|-----|--------|
| < 15 | No trend (ranging) |
| 15-25 | Weak trend |
| 25-40 | Strong trend |
| > 40 | Very strong trend |

### Regime Classification

```typescript
// lib/advancedMath.ts
export function detectMarketRegime(
  closes: number[],
  highs: number[],
  lows: number[]
): RegimeResult {
  // Calculate ADX-like directional movement
  const dx = calculateDX(highs, lows, closes);
  const volatility = calculateVolatility(closes);
  
  if (dx > 25 && volatility < 8) {
    return { regime: 'trending', strength: dx / 50 };
  } else if (volatility > 12) {
    return { regime: 'volatile', strength: volatility / 20 };
  } else if (dx < 15 && volatility > 6) {
    return { regime: 'choppy', strength: 1 - dx / 25 };
  } else {
    return { regime: 'ranging', strength: 0.5 };
  }
}
```

### Regime-Based Strategy Adjustments

| Regime | Confidence Adj | Position Size | Stop Width |
|--------|----------------|---------------|------------|
| Trending | +10% | +20% | Wider |
| Ranging | +5% | Normal | Tighter |
| Volatile | -10% | -30% | Much Wider |
| Choppy | -20% | -50% | Normal |

---

## 📊 Performance Metrics

### Win Rate

```
Win Rate = Winning Trades / Total Trades × 100
```

### Average Win/Loss

```
Avg Win = Σ Winning Trade P&L / # Winning Trades
Avg Loss = |Σ Losing Trade P&L| / # Losing Trades
```

### Maximum Drawdown

```
Drawdown(t) = (Peak(0:t) - Equity(t)) / Peak(0:t)
Max Drawdown = max(Drawdown(t)) for all t
```

### Recovery Factor

```
Recovery Factor = Net Profit / Max Drawdown
```

Higher is better. A recovery factor of 3 means you've made 3× your worst drawdown.

---

## 🎲 Monte Carlo Simulation

### Purpose

Monte Carlo simulation helps understand the range of possible outcomes by:
1. Simulating thousands of possible trade sequences
2. Calculating probability distributions of returns
3. Estimating risk of ruin

### Implementation

```typescript
// lib/advancedMath.ts
export function runMonteCarloSimulation(
  winRate: number,
  avgWin: number,
  avgLoss: number,
  numTrades: number = 100,
  simulations: number = 1000
): MonteCarloResult {
  const finalReturns: number[] = [];
  const maxDrawdowns: number[] = [];
  
  for (let sim = 0; sim < simulations; sim++) {
    let equity = 100;
    let peak = 100;
    let maxDD = 0;
    
    for (let trade = 0; trade < numTrades; trade++) {
      const isWin = Math.random() < winRate;
      const change = isWin ? avgWin : -avgLoss;
      
      equity *= (1 + change / 100);
      
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
      
      if (equity < 50) break; // Ruin
    }
    
    finalReturns.push((equity - 100) / 100);
    maxDrawdowns.push(maxDD);
  }
  
  return {
    medianReturn: percentile(finalReturns, 0.5),
    percentile5: percentile(finalReturns, 0.05),
    percentile95: percentile(finalReturns, 0.95),
    probabilityOfProfit: finalReturns.filter(r => r > 0).length / simulations,
    probabilityOfRuin: finalReturns.filter(r => r < -0.5).length / simulations,
    maxDrawdown: {
      median: percentile(maxDrawdowns, 0.5),
      worst: percentile(maxDrawdowns, 0.95)
    }
  };
}
```

### Risk of Ruin Formula

Simplified analytical formula:

```
Risk of Ruin = ((1 - edge) / (1 + edge)) ^ (Capital Units / Risk Per Trade)
```

Where:
- `edge = (Win% × R:R) - Loss%`
- `Capital Units = % to Ruin / % Risk Per Trade`

Example:
```
Win Rate: 55%
R:R: 2:1
Risk per trade: 3%
Ruin = 50% drawdown

edge = (0.55 × 2) - 0.45 = 0.65
units = 50 / 3 = 16.67
RoR = (0.35 / 1.65) ^ 16.67 = 0.0001 = 0.01%
```

---

## 📝 Quick Reference

### Position Sizing Formula

```
Size = Account × Kelly Fraction × 0.15 × Vol Adj × Regime Adj × Min(1, Confidence / 0.6)
```

### Stop-Loss Formula

```
LONG:  SL = Entry × (1 - ATR% × Multiplier / 100)
SHORT: SL = Entry × (1 + ATR% × Multiplier / 100)
```

### Expected Value Formula

```
EV = (Win% × Avg Win) - (Loss% × Avg Loss)
```

### Optimal R:R for Win Rate

```
Min R:R = (1 - Win Rate) / Win Rate
```

### Sharpe Ratio Formula

```
Sharpe = (Return - 5%) / Volatility × √365
```

---

**Last Updated**: February 2025 | **Version**: 7.1.0

