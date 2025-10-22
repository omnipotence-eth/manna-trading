import {
  TRADING_CONSTANTS,
  SUPPORTED_SYMBOLS,
  MODEL_NAMES,
  ERROR_MESSAGES,
} from '../index';

describe('Constants', () => {
  describe('TRADING_CONSTANTS', () => {
    it('should have valid initial balance', () => {
      expect(TRADING_CONSTANTS.INITIAL_BALANCE).toBe(50000);
      expect(TRADING_CONSTANTS.INITIAL_BALANCE).toBeGreaterThan(0);
    });

    it('should have valid leverage ranges', () => {
      expect(TRADING_CONSTANTS.MIN_LEVERAGE).toBe(1);
      expect(TRADING_CONSTANTS.MAX_LEVERAGE).toBe(1001);
      expect(TRADING_CONSTANTS.MAX_LEVERAGE).toBeGreaterThan(
        TRADING_CONSTANTS.MIN_LEVERAGE
      );
    });

    it('should have positive update intervals', () => {
      expect(TRADING_CONSTANTS.PRICE_UPDATE_INTERVAL).toBeGreaterThan(0);
      expect(TRADING_CONSTANTS.ACCOUNT_UPDATE_INTERVAL).toBeGreaterThan(0);
      expect(TRADING_CONSTANTS.CHART_UPDATE_INTERVAL).toBeGreaterThan(0);
    });

    it('should have valid risk management values', () => {
      expect(TRADING_CONSTANTS.DEFAULT_STOP_LOSS).toBeLessThan(1);
      expect(TRADING_CONSTANTS.DEFAULT_TAKE_PROFIT).toBeLessThan(1);
      expect(TRADING_CONSTANTS.MAX_RISK_PER_TRADE).toBeLessThan(1);
    });
  });

  describe('SUPPORTED_SYMBOLS', () => {
    it('should contain valid trading pairs', () => {
      expect(SUPPORTED_SYMBOLS).toContain('BTC/USDT');
      expect(SUPPORTED_SYMBOLS).toContain('ETH/USDT');
      expect(SUPPORTED_SYMBOLS).toContain('SOL/USDT');
    });

    it('should have proper format', () => {
      SUPPORTED_SYMBOLS.forEach(symbol => {
        expect(symbol).toMatch(/^[A-Z]+\/[A-Z]+$/);
      });
    });

    it('should not be empty', () => {
      expect(SUPPORTED_SYMBOLS.length).toBeGreaterThan(0);
    });
  });

  describe('MODEL_NAMES', () => {
    it('should contain expected models', () => {
      expect(MODEL_NAMES).toContain('AlphaTrader');
      expect(MODEL_NAMES).toContain('QuantumAI');
      expect(MODEL_NAMES).toContain('NeuralNet-V2');
    });

    it('should not be empty', () => {
      expect(MODEL_NAMES.length).toBeGreaterThan(0);
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have clear error messages', () => {
      expect(ERROR_MESSAGES.INVALID_SYMBOL).toBeTruthy();
      expect(ERROR_MESSAGES.INVALID_SIZE).toBeTruthy();
      expect(ERROR_MESSAGES.INVALID_LEVERAGE).toBeTruthy();
    });

    it('should have descriptive messages', () => {
      Object.values(ERROR_MESSAGES).forEach(message => {
        expect(message.length).toBeGreaterThan(10);
      });
    });
  });
});

