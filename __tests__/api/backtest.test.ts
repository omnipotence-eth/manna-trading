/**
 * Backtest API tests (mock klines, scoring shape)
 * @jest-environment node
 */
import { GET } from '@/app/api/backtest/route';

jest.mock('@/services/exchange/asterDexService', () => {
  const klines = Array.from({ length: 50 }, (_, i) => ({
    openTime: 1000 + i * 3600000,
    open: 100,
    high: 100.5,
    low: 99.5,
    close: 100,
    volume: 1000,
    closeTime: 1000 + (i + 1) * 3600000,
  }));
  return {
    asterDexService: {
      getKlines: jest.fn().mockResolvedValue(klines),
    },
  };
});

describe('GET /api/backtest', () => {
  it('returns summary and results when klines available', async () => {
    const req = new Request('http://localhost/api/backtest?symbol=BTCUSDT&interval=1h&limit=50');
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.symbol).toBe('BTCUSDT');
    expect(body.bars).toBeGreaterThan(0);
    expect(body.summary).toBeDefined();
    expect(typeof body.summary.avgScore).toBe('number');
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBe(body.bars);
  });

  it('returns 400 when insufficient klines', async () => {
    const { asterDexService } = await import('@/services/exchange/asterDexService');
    (asterDexService.getKlines as jest.Mock).mockResolvedValueOnce([]);
    const req = new Request('http://localhost/api/backtest?symbol=X&limit=10');
    const res = await GET(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Insufficient/);
  });
});
