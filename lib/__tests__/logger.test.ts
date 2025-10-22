import { logger } from '../logger';

describe('Logger', () => {
  // Store original console methods
  const originalConsole = global.console;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original console
    global.console = originalConsole;
  });

  describe('info', () => {
    it('should log info messages', () => {
      const consoleSpy = jest.spyOn(console, 'info');
      logger.info('Test message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log with context', () => {
      const consoleSpy = jest.spyOn(console, 'info');
      logger.info('Test message', { context: 'TEST' });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST]'),
        undefined
      );
    });

    it('should log with data', () => {
      const consoleSpy = jest.spyOn(console, 'info');
      const testData = { key: 'value' };
      logger.info('Test message', { data: testData });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.any(String),
        testData
      );
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error');
      logger.error('Error message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log Error objects', () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred'),
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error',
          }),
        })
      );
    });
  });

  describe('trade', () => {
    it('should log trade events', () => {
      const consoleSpy = jest.spyOn(console, 'info');
      logger.trade('Order placed', { symbol: 'BTC/USDT', size: 0.1 });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Trade: Order placed'),
        expect.objectContaining({
          symbol: 'BTC/USDT',
          size: 0.1,
        })
      );
    });
  });

  describe('api', () => {
    it('should log API calls', () => {
      const consoleSpy = jest.spyOn(console, 'debug');
      logger.api('GET', '/api/test', 200, 100);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should warn on error status codes', () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      logger.api('POST', '/api/test', 500);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

