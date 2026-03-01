/**
 * Unit tests for Kelly Criterion position sizing
 */
import { calculateFullKelly } from '@/lib/kellyCriterion';

describe('calculateFullKelly', () => {
  it('returns 0 when win rate is 0', () => {
    expect(calculateFullKelly(0, 2)).toBe(0);
  });

  it('returns 0 when win rate is 1', () => {
    expect(calculateFullKelly(1, 2)).toBe(0);
  });

  it('returns 0 when win/loss ratio is 0 or negative', () => {
    expect(calculateFullKelly(0.6, 0)).toBe(0);
    expect(calculateFullKelly(0.6, -1)).toBe(0);
  });

  it('returns positive fraction for 50% win rate and 2:1 reward/risk', () => {
    const kelly = calculateFullKelly(0.5, 2);
    expect(kelly).toBeGreaterThan(0);
    expect(kelly).toBeLessThanOrEqual(1);
    // (2*0.5 - 0.5) / 2 = 0.25
    expect(kelly).toBeCloseTo(0.25, 4);
  });

  it('returns 0 for no edge (50% win rate, 1:1 ratio)', () => {
    const kelly = calculateFullKelly(0.5, 1);
    expect(kelly).toBe(0);
  });

  it('caps result between 0 and 1', () => {
    const kelly = calculateFullKelly(0.9, 10);
    expect(kelly).toBeLessThanOrEqual(1);
    expect(kelly).toBeGreaterThanOrEqual(0);
  });
});
