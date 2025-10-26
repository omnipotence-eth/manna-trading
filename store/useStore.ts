import { create } from 'zustand';

interface Trade {
  id: string;
  timestamp: string;
  model: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  status?: 'completed' | 'open'; // Optional for backwards compatibility
  // Entry analysis
  entryReason: string;
  entryConfidence: number;
  entrySignals: string[];
  entryMarketRegime: string;
  entryScore: string;
  // Exit analysis
  exitReason: string;
  exitTimestamp: string;
  duration: number; // in seconds
}

interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  model: string;
  leverage: number;
  // Entry analysis (for trade journal later)
  entryReason?: string;
  entryConfidence?: number;
  entrySignals?: string[];
  entryMarketRegime?: string;
  entryScore?: string;
  entryTimestamp?: number;
}

interface ModelStats {
  name: string;
  pnl: number;
  trades: number;
  winRate: number;
}

interface LivePrice {
  symbol: string;
  price: number;
  change?: number;
  lastUpdate: number;
}

interface ModelMessage {
  id: string;
  model: string;
  message: string;
  timestamp: number;
  type: 'analysis' | 'trade' | 'alert';
}

interface AppState {
  // Connection status
  isConnected: boolean;
  setConnected: (connected: boolean) => void;

  // Live market data
  livePrices: Record<string, LivePrice>;
  updateLivePrice: (symbol: string, price: LivePrice) => void;

  // Trading data
  trades: Trade[];
  positions: Position[];
  addTrade: (trade: Trade) => void;
  updatePosition: (position: Position) => void;
  removePosition: (id: string) => void;

  // Models
  modelStats: ModelStats[];
  updateModelStats: (stats: ModelStats) => void;
  modelMessages: ModelMessage[];
  addModelMessage: (message: ModelMessage) => void;

  // Account
  accountValue: number;
  setAccountValue: (value: number) => void;
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  isConnected: false,
  trades: [],
  positions: [],
  modelStats: [],
  accountValue: 100,
  livePrices: {},
  modelMessages: [],

  // Actions
  setConnected: (connected) => set({ isConnected: connected }),

  updateLivePrice: (symbol, price) =>
    set((state) => ({
      livePrices: {
        ...state.livePrices,
        [symbol]: price,
      },
    })),

  addTrade: (trade) =>
    set((state) => {
      // Check if trade already exists (by ID)
      const existingIndex = state.trades.findIndex((t) => t.id === trade.id);
      if (existingIndex >= 0) {
        // Trade already exists, don't add duplicate
        return state;
      }
      // Add new trade and keep last 100
      return {
        trades: [trade, ...state.trades.slice(0, 99)],
      };
    }),

  updatePosition: (position) =>
    set((state) => {
      const existingIndex = state.positions.findIndex((p) => p.id === position.id);
      if (existingIndex >= 0) {
        const newPositions = [...state.positions];
        newPositions[existingIndex] = position;
        return { positions: newPositions };
      }
      return { positions: [...state.positions, position] };
    }),

  removePosition: (id) =>
    set((state) => ({
      positions: state.positions.filter((p) => p.id !== id),
    })),

  updateModelStats: (stats) =>
    set((state) => {
      const existingIndex = state.modelStats.findIndex((s) => s.name === stats.name);
      if (existingIndex >= 0) {
        const newStats = [...state.modelStats];
        newStats[existingIndex] = stats;
        return { modelStats: newStats };
      }
      return { modelStats: [...state.modelStats, stats] };
    }),

  addModelMessage: (message) =>
    set((state) => {
      // Check if message already exists (by ID)
      const existingIndex = state.modelMessages.findIndex((m) => m.id === message.id);
      if (existingIndex >= 0) {
        // Message already exists, don't add duplicate
        return state;
      }
      // Add new message and keep last 50
      return {
        modelMessages: [message, ...state.modelMessages.slice(0, 49)],
      };
    }),

  setAccountValue: (value) => set({ accountValue: value }),
}));

export default useStore;

