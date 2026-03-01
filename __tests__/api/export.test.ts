/**
 * Export API tests (handler shape and query params)
 * @jest-environment node
 */
import { GET } from '@/app/api/export/route';

// Mock db and config to avoid real DB
jest.mock('@/lib/db', () => ({
  initializeDatabase: jest.fn().mockResolvedValue(true),
  getTrades: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/configService', () => ({
  dbConfig: { connectionString: '', isConfigured: false },
  asterConfig: { trading: { simulationMode: true } },
}));
jest.mock('@/lib/tradeMemory', () => ({
  initializeDatabase: jest.fn().mockResolvedValue(undefined),
  getTrades: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/trading/simulationService', () => ({
  simulationService: { updatePositions: jest.fn(), getStats: jest.fn().mockReturnValue(null) },
}));

describe('GET /api/export', () => {
  it('returns JSON with trades array when format=json', async () => {
    const req = new Request('http://localhost/api/export?format=json&limit=10');
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.trades)).toBe(true);
    expect(body.data?.meta).toBeDefined();
  });

  it('accepts source filter', async () => {
    const req = new Request('http://localhost/api/export?format=json&source=simulation');
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data?.meta?.sourceFilter).toBeDefined();
  });
});
