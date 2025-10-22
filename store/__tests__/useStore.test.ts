import { renderHook, act } from '@testing-library/react';
import { useStore } from '../useStore';

describe('useStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useStore());
    act(() => {
      result.current.setConnected(false);
      result.current.setAccountValue(50000);
      // Clear arrays
      while (useStore.getState().trades.length > 0) {
        useStore.setState({ trades: [] });
      }
      while (useStore.getState().positions.length > 0) {
        useStore.setState({ positions: [] });
      }
      while (useStore.getState().modelStats.length > 0) {
        useStore.setState({ modelStats: [] });
      }
    });
  });

  describe('Connection Status', () => {
    it('should initialize with disconnected state', () => {
      const { result } = renderHook(() => useStore());
      expect(result.current.isConnected).toBe(false);
    });

    it('should update connection status', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.setConnected(true);
      });

      expect(result.current.isConnected).toBe(true);

      act(() => {
        result.current.setConnected(false);
      });

      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('Account Value', () => {
    it('should initialize with default account value', () => {
      const { result } = renderHook(() => useStore());
      expect(result.current.accountValue).toBe(50000);
    });

    it('should update account value', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.setAccountValue(75000);
      });

      expect(result.current.accountValue).toBe(75000);
    });
  });

  describe('Trades', () => {
    it('should initialize with empty trades array', () => {
      const { result } = renderHook(() => useStore());
      expect(result.current.trades).toEqual([]);
    });

    it('should add a trade', () => {
      const { result } = renderHook(() => useStore());

      const trade = {
        id: '1',
        timestamp: new Date().toISOString(),
        model: 'AlphaTrader',
        symbol: 'BTC/USDT',
        side: 'LONG' as const,
        size: 0.1,
        entryPrice: 95000,
        exitPrice: 96000,
        pnl: 100,
        pnlPercent: 1.05,
      };

      act(() => {
        result.current.addTrade(trade);
      });

      expect(result.current.trades).toHaveLength(1);
      expect(result.current.trades[0]).toEqual(trade);
    });

    it('should add trades to the beginning of array', () => {
      const { result } = renderHook(() => useStore());

      const trade1 = {
        id: '1',
        timestamp: new Date().toISOString(),
        model: 'AlphaTrader',
        symbol: 'BTC/USDT',
        side: 'LONG' as const,
        size: 0.1,
        entryPrice: 95000,
        exitPrice: 96000,
        pnl: 100,
        pnlPercent: 1.05,
      };

      const trade2 = {
        id: '2',
        timestamp: new Date().toISOString(),
        model: 'QuantumAI',
        symbol: 'ETH/USDT',
        side: 'SHORT' as const,
        size: 1,
        entryPrice: 3500,
        exitPrice: 3450,
        pnl: 50,
        pnlPercent: 1.43,
      };

      act(() => {
        result.current.addTrade(trade1);
        result.current.addTrade(trade2);
      });

      expect(result.current.trades).toHaveLength(2);
      expect(result.current.trades[0].id).toBe('2');
      expect(result.current.trades[1].id).toBe('1');
    });

    it('should keep only last 100 trades', () => {
      const { result } = renderHook(() => useStore());

      // Add 105 trades
      act(() => {
        for (let i = 0; i < 105; i++) {
          result.current.addTrade({
            id: `${i}`,
            timestamp: new Date().toISOString(),
            model: 'AlphaTrader',
            symbol: 'BTC/USDT',
            side: 'LONG',
            size: 0.1,
            entryPrice: 95000,
            exitPrice: 96000,
            pnl: 100,
            pnlPercent: 1.05,
          });
        }
      });

      expect(result.current.trades).toHaveLength(100);
      expect(result.current.trades[0].id).toBe('104'); // Most recent
    });
  });

  describe('Positions', () => {
    it('should initialize with empty positions array', () => {
      const { result } = renderHook(() => useStore());
      expect(result.current.positions).toEqual([]);
    });

    it('should add a new position', () => {
      const { result } = renderHook(() => useStore());

      const position = {
        id: '1',
        symbol: 'BTC/USDT',
        side: 'LONG' as const,
        size: 0.5,
        entryPrice: 95000,
        currentPrice: 96000,
        pnl: 500,
        pnlPercent: 1.05,
        model: 'AlphaTrader',
      };

      act(() => {
        result.current.updatePosition(position);
      });

      expect(result.current.positions).toHaveLength(1);
      expect(result.current.positions[0]).toEqual(position);
    });

    it('should update existing position', () => {
      const { result } = renderHook(() => useStore());

      const position = {
        id: '1',
        symbol: 'BTC/USDT',
        side: 'LONG' as const,
        size: 0.5,
        entryPrice: 95000,
        currentPrice: 96000,
        pnl: 500,
        pnlPercent: 1.05,
        model: 'AlphaTrader',
      };

      act(() => {
        result.current.updatePosition(position);
      });

      const updatedPosition = {
        ...position,
        currentPrice: 97000,
        pnl: 1000,
        pnlPercent: 2.11,
      };

      act(() => {
        result.current.updatePosition(updatedPosition);
      });

      expect(result.current.positions).toHaveLength(1);
      expect(result.current.positions[0].currentPrice).toBe(97000);
      expect(result.current.positions[0].pnl).toBe(1000);
    });

    it('should remove a position', () => {
      const { result } = renderHook(() => useStore());

      const position = {
        id: '1',
        symbol: 'BTC/USDT',
        side: 'LONG' as const,
        size: 0.5,
        entryPrice: 95000,
        currentPrice: 96000,
        pnl: 500,
        pnlPercent: 1.05,
        model: 'AlphaTrader',
      };

      act(() => {
        result.current.updatePosition(position);
      });

      expect(result.current.positions).toHaveLength(1);

      act(() => {
        result.current.removePosition('1');
      });

      expect(result.current.positions).toHaveLength(0);
    });

    it('should not affect other positions when removing one', () => {
      const { result } = renderHook(() => useStore());

      const position1 = {
        id: '1',
        symbol: 'BTC/USDT',
        side: 'LONG' as const,
        size: 0.5,
        entryPrice: 95000,
        currentPrice: 96000,
        pnl: 500,
        pnlPercent: 1.05,
        model: 'AlphaTrader',
      };

      const position2 = {
        id: '2',
        symbol: 'ETH/USDT',
        side: 'SHORT' as const,
        size: 2,
        entryPrice: 3500,
        currentPrice: 3450,
        pnl: 100,
        pnlPercent: 1.43,
        model: 'QuantumAI',
      };

      act(() => {
        result.current.updatePosition(position1);
        result.current.updatePosition(position2);
      });

      expect(result.current.positions).toHaveLength(2);

      act(() => {
        result.current.removePosition('1');
      });

      expect(result.current.positions).toHaveLength(1);
      expect(result.current.positions[0].id).toBe('2');
    });
  });

  describe('Model Stats', () => {
    it('should initialize with empty model stats array', () => {
      const { result } = renderHook(() => useStore());
      expect(result.current.modelStats).toEqual([]);
    });

    it('should add new model stats', () => {
      const { result } = renderHook(() => useStore());

      const stats = {
        name: 'AlphaTrader',
        pnl: 1500,
        trades: 50,
        winRate: 0.65,
      };

      act(() => {
        result.current.updateModelStats(stats);
      });

      expect(result.current.modelStats).toHaveLength(1);
      expect(result.current.modelStats[0]).toEqual(stats);
    });

    it('should update existing model stats', () => {
      const { result } = renderHook(() => useStore());

      const stats = {
        name: 'AlphaTrader',
        pnl: 1500,
        trades: 50,
        winRate: 0.65,
      };

      act(() => {
        result.current.updateModelStats(stats);
      });

      const updatedStats = {
        name: 'AlphaTrader',
        pnl: 2000,
        trades: 60,
        winRate: 0.70,
      };

      act(() => {
        result.current.updateModelStats(updatedStats);
      });

      expect(result.current.modelStats).toHaveLength(1);
      expect(result.current.modelStats[0].pnl).toBe(2000);
      expect(result.current.modelStats[0].trades).toBe(60);
      expect(result.current.modelStats[0].winRate).toBe(0.70);
    });

    it('should maintain multiple model stats independently', () => {
      const { result } = renderHook(() => useStore());

      const stats1 = {
        name: 'AlphaTrader',
        pnl: 1500,
        trades: 50,
        winRate: 0.65,
      };

      const stats2 = {
        name: 'QuantumAI',
        pnl: 1200,
        trades: 40,
        winRate: 0.60,
      };

      act(() => {
        result.current.updateModelStats(stats1);
        result.current.updateModelStats(stats2);
      });

      expect(result.current.modelStats).toHaveLength(2);
      expect(result.current.modelStats.find(s => s.name === 'AlphaTrader')).toEqual(stats1);
      expect(result.current.modelStats.find(s => s.name === 'QuantumAI')).toEqual(stats2);
    });
  });
});

