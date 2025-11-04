/**
 * Symbol Formatting Utilities
 * Centralized functions for symbol format conversion
 */

/**
 * Convert symbol from BTCUSDT format to BTC/USDT format
 * Handles cases where symbol already has slash
 */
export function formatSymbolDisplay(symbol: string): string {
  if (!symbol) return '';
  // If already has slash, return as-is
  if (symbol.includes('/')) {
    return symbol;
  }
  // Convert BTCUSDT to BTC/USDT
  return symbol.replace('USDT', '/USDT');
}

/**
 * Convert symbol from BTC/USDT format to BTCUSDT format (for API calls)
 */
export function formatSymbolApi(symbol: string): string {
  if (!symbol) return '';
  // Remove slash if present
  return symbol.replace('/', '');
}

/**
 * Normalize symbol to ensure consistent format
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol) return '';
  // Remove any existing slash, then format to display format
  const withoutSlash = symbol.replace('/', '');
  return formatSymbolDisplay(withoutSlash);
}

/**
 * Validate symbol format
 */
export function isValidSymbolFormat(symbol: string): boolean {
  if (!symbol) return false;
  // Must be in format BASE/QUOTE (e.g., BTC/USDT)
  const parts = symbol.split('/');
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

