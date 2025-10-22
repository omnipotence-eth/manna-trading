import { asterDexService } from '../asterDexService';
import { ERROR_MESSAGES, TRADING_CONSTANTS } from '@/constants';
import { logger } from '@/lib/logger';
import { AsterMarket, AsterOrder } from '@/types/trading';

jest.mock('@/lib/logger');

// Mock global fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('AsterDexService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const result = await asterDexService.initialize();
      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Connected to Aster DEX'),
        expect.any(Object)
      );
    });
  });

  describe('getMarkets', () => {
    it('should return available markets', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ([
          { symbol: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT', maxLeverage: 100, minOrderSize: 0.001 },
          { symbol: 'ETH/USDT', baseAsset: 'ETH', quoteAsset: 'USDT', maxLeverage: 100, minOrderSize: 0.01 },
        ]),
      });

      const markets = await asterDexService.getMarkets();
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);
      expect(logger.info).toHaveBeenCalledWith('Fetched real markets', expect.any(Object));
    });

    it('should handle API error and return empty array', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      const markets = await asterDexService.getMarkets();
      expect(markets).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(ERROR_MESSAGES.API_FETCH_ERROR, expect.anything(), expect.any(Object));
    });
  });

  describe('getPrice', () => {
    it('should return price for valid symbol', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ price: 95000 }),
      });

      const price = await asterDexService.getPrice('BTC/USDT');
      expect(typeof price).toBe('number');
      expect(price).toBeGreaterThan(0);
    });

    it('should return 0 on error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const price = await asterDexService.getPrice('BTC/USDT');
      expect(price).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Failed to get real price', expect.anything(), expect.any(Object));
    });
  });

  describe('placeMarketOrder', () => {
    it('should validate order parameters', async () => {
      await expect(async () => await asterDexService.placeMarketOrder('', 'BUY', 0.1, 1)).rejects.toThrow(ERROR_MESSAGES.INVALID_SYMBOL);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should reject negative size', async () => {
      await expect(async () => await asterDexService.placeMarketOrder('BTC/USDT', 'BUY', -0.1, 1)).rejects.toThrow(ERROR_MESSAGES.INVALID_SIZE);
    });

    it('should reject invalid leverage', async () => {
      await expect(async () => await asterDexService.placeMarketOrder('BTC/USDT', 'BUY', 0.1, 2000)).rejects.toThrow(ERROR_MESSAGES.INVALID_LEVERAGE);
    });

    it('should place valid order', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ orderId: 'test-id', symbol: 'BTC/USDT', side: 'BUY', type: 'MARKET', size: 0.1, status: 'FILLED' }),
      });

      const order = await asterDexService.placeMarketOrder('BTC/USDT', 'BUY', 0.1, 5);
      expect(order).not.toBeNull();
      expect(order?.orderId).toBe('test-id');
      expect(order?.type).toBe('MARKET');
      expect(logger.trade).toHaveBeenCalledWith('Placed real market order', expect.any(Object));
    });

    it('should handle order failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      const order = await asterDexService.placeMarketOrder('BTC/USDT', 'BUY', 0.1, 5);
      expect(order).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(ERROR_MESSAGES.ORDER_EXECUTION_FAILED, expect.anything(), expect.any(Object));
    });
  });

  describe('placeLimitOrder', () => {
    it('should validate price', async () => {
      await expect(async () => await asterDexService.placeLimitOrder('BTC/USDT', 'BUY', 0.1, -100, 1)).rejects.toThrow(ERROR_MESSAGES.INVALID_PRICE);
    });

    it('should place valid limit order', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ orderId: 'test-id', symbol: 'BTC/USDT', side: 'BUY', type: 'LIMIT', price: 95000, size: 0.1, status: 'PENDING' }),
      });

      const order = await asterDexService.placeLimitOrder('BTC/USDT', 'BUY', 0.1, 95000, 5);
      expect(order).not.toBeNull();
      expect(order?.type).toBe('LIMIT');
      expect(order?.price).toBe(95000);
      expect(logger.trade).toHaveBeenCalledWith('Placed real limit order', expect.any(Object));
    });

    it('should support hidden orders', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ orderId: 'test-id', symbol: 'BTC/USDT', side: 'BUY', type: 'LIMIT', price: 95000, size: 0.1, status: 'PENDING', hidden: true }),
      });

      const order = await asterDexService.placeLimitOrder('BTC/USDT', 'BUY', 0.1, 95000, 5, true);
      expect(order).not.toBeNull();
      expect(order?.hidden).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: expect.objectContaining({ hidden: true }) }));
    });
  });

  describe('closePosition', () => {
    it('should validate symbol', async () => {
      const result = await asterDexService.closePosition('');
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should close valid position', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await asterDexService.closePosition('BTC/USDT');
      expect(result).toBe(true);
      expect(logger.trade).toHaveBeenCalledWith('Closed real position', expect.any(Object));
    });
  });

  describe('getBalance', () => {
    it('should return balance', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ totalValue: 50000 }),
      });

      const balance = await asterDexService.getBalance();
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });
  });
});

