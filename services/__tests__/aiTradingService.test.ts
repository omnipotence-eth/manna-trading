import { aiTradingService, AlphaTraderModel, QuantumAIModel, NeuralNetV2Model } from '../aiTradingService';
import { asterDexService } from '../asterDexService';
import { logger } from '@/lib/logger';
import type { MarketData } from '@/types/trading';

// Mock dependencies
jest.mock('../asterDexService');
jest.mock('@/lib/logger');

describe('AI Trading Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AlphaTraderModel', () => {
    let model: AlphaTraderModel;

    beforeEach(() => {
      model = new AlphaTraderModel();
    });

    it('should initialize with correct config', () => {
      expect(model['config'].name).toBe('AlphaTrader');
      expect(model['config'].strategy).toBe('Momentum + Trend Following');
      expect(model['config'].maxLeverage).toBe(10);
    });

    it('should generate BUY signal on strong upward momentum', async () => {
      const marketData: MarketData = {
        currentPrice: 100,
        previousPrice: 98,
        movingAverage: 99,
        volume: 1000000,
        averageVolume: 500000,
        priceChange: 0.02,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('BUY');
      expect(signal.confidence).toBeGreaterThan(0);
      expect(signal.symbol).toBe('BTC/USDT');
    });

    it('should generate SELL signal on strong downward momentum', async () => {
      const marketData: MarketData = {
        currentPrice: 98,
        previousPrice: 100,
        movingAverage: 99,
        volume: 1000000,
        averageVolume: 500000,
        priceChange: -0.02,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('SELL');
      expect(signal.confidence).toBeGreaterThan(0);
    });

    it('should generate HOLD signal on weak momentum', async () => {
      const marketData: MarketData = {
        currentPrice: 100,
        previousPrice: 100.5,
        movingAverage: 100,
        volume: 1000000,
        averageVolume: 500000,
        priceChange: 0.005,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('HOLD');
      expect(signal.confidence).toBe(0);
    });

    it('should calculate leverage based on confidence', () => {
      const leverage1 = model['calculateLeverage'](1);
      const leverage2 = model['calculateLeverage'](0.5);

      expect(leverage1).toBe(10);
      expect(leverage2).toBe(5);
    });
  });

  describe('QuantumAIModel', () => {
    let model: QuantumAIModel;

    beforeEach(() => {
      model = new QuantumAIModel();
    });

    it('should initialize with correct config', () => {
      expect(model['config'].name).toBe('QuantumAI');
      expect(model['config'].strategy).toBe('Statistical Arbitrage');
      expect(model['config'].maxLeverage).toBe(5);
      expect(model['config'].riskLevel).toBe('LOW');
    });

    it('should generate BUY signal when price below moving average', async () => {
      const marketData: MarketData = {
        currentPrice: 97,
        previousPrice: 98,
        movingAverage: 100,
        volume: 1000000,
        averageVolume: 500000,
        priceChange: -0.03,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('BUY');
      expect(signal.size).toBe(0.15);
    });

    it('should generate SELL signal when price above moving average', async () => {
      const marketData: MarketData = {
        currentPrice: 103,
        previousPrice: 102,
        movingAverage: 100,
        volume: 1000000,
        averageVolume: 500000,
        priceChange: 0.03,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('SELL');
    });

    it('should generate HOLD signal when price within range', async () => {
      const marketData: MarketData = {
        currentPrice: 100.5,
        previousPrice: 100,
        movingAverage: 100,
        volume: 1000000,
        averageVolume: 500000,
        priceChange: 0.005,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('HOLD');
    });
  });

  describe('NeuralNetV2Model', () => {
    let model: NeuralNetV2Model;

    beforeEach(() => {
      model = new NeuralNetV2Model();
    });

    it('should initialize with correct config', () => {
      expect(model['config'].name).toBe('NeuralNet-V2');
      expect(model['config'].strategy).toBe('Deep Learning + Pattern Recognition');
      expect(model['config'].maxLeverage).toBe(8);
    });

    it('should generate BUY signal on volume spike with positive price action', async () => {
      const marketData: MarketData = {
        currentPrice: 100,
        previousPrice: 98,
        movingAverage: 99,
        volume: 800000,
        averageVolume: 500000,
        priceChange: 0.02,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('BUY');
      expect(signal.size).toBe(0.2);
    });

    it('should generate SELL signal on volume spike with negative price action', async () => {
      const marketData: MarketData = {
        currentPrice: 98,
        previousPrice: 100,
        movingAverage: 99,
        volume: 800000,
        averageVolume: 500000,
        priceChange: -0.02,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('SELL');
    });

    it('should generate HOLD signal without significant pattern', async () => {
      const marketData: MarketData = {
        currentPrice: 100,
        previousPrice: 100,
        movingAverage: 100,
        volume: 500000,
        averageVolume: 500000,
        priceChange: 0,
      };

      const signal = await model.analyze('BTC/USDT', marketData);

      expect(signal.action).toBe('HOLD');
    });
  });

  describe('AITradingService', () => {
    beforeEach(() => {
      (asterDexService.initialize as jest.Mock).mockResolvedValue(true);
      (asterDexService.getPrice as jest.Mock).mockResolvedValue(95000);
      (asterDexService.placeMarketOrder as jest.Mock).mockResolvedValue({
        orderId: 'test-order-123',
        symbol: 'BTC/USDT',
        side: 'BUY',
        type: 'MARKET',
        size: 0.1,
        status: 'FILLED',
      });
    });

    it('should initialize with models', () => {
      const models = aiTradingService.getModels();
      expect(models).toHaveLength(3);
      expect(models[0]['config'].name).toBe('AlphaTrader');
      expect(models[1]['config'].name).toBe('QuantumAI');
      expect(models[2]['config'].name).toBe('NeuralNet-V2');
    });

    it('should start trading service', async () => {
      await aiTradingService.start();

      expect(asterDexService.initialize).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('AI trading service started'),
        expect.any(Object)
      );
    });

    it('should not start if already running', async () => {
      await aiTradingService.start();
      jest.clearAllMocks();

      await aiTradingService.start();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already running'),
        expect.any(Object)
      );
    });

    it('should stop trading service', async () => {
      await aiTradingService.start();
      await aiTradingService.stop();

      expect(asterDexService.disconnect).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('stopped'),
        expect.any(Object)
      );
    });
  });

  describe('Trade Execution', () => {
    let model: AlphaTraderModel;

    beforeEach(() => {
      model = new AlphaTraderModel();
      (asterDexService.placeMarketOrder as jest.Mock).mockResolvedValue({
        orderId: 'test-order-123',
        symbol: 'BTC/USDT',
        side: 'BUY',
        type: 'MARKET',
        size: 0.1,
        status: 'FILLED',
      });
    });

    it('should not execute HOLD signals', async () => {
      const signal = {
        symbol: 'BTC/USDT',
        action: 'HOLD' as const,
        confidence: 0,
        size: 0,
        reasoning: 'No action',
      };

      const result = await model.executeTrade(signal);

      expect(result).toBe(false);
      expect(asterDexService.placeMarketOrder).not.toHaveBeenCalled();
    });

    it('should execute BUY signals', async () => {
      const signal = {
        symbol: 'BTC/USDT',
        action: 'BUY' as const,
        confidence: 0.8,
        size: 0.1,
        reasoning: 'Strong momentum',
      };

      const result = await model.executeTrade(signal);

      expect(result).toBe(true);
      expect(asterDexService.placeMarketOrder).toHaveBeenCalledWith(
        'BTC/USDT',
        'BUY',
        0.1,
        expect.any(Number)
      );
      expect(logger.trade).toHaveBeenCalled();
    });

    it('should handle trade execution errors', async () => {
      (asterDexService.placeMarketOrder as jest.Mock).mockResolvedValue(null);

      const signal = {
        symbol: 'BTC/USDT',
        action: 'BUY' as const,
        confidence: 0.8,
        size: 0.1,
        reasoning: 'Strong momentum',
      };

      const result = await model.executeTrade(signal);

      expect(result).toBe(false);
    });
  });
});

