/**
 * Client-side stub for lib/db.ts
 * This file is used by webpack to replace @/lib/db imports on the client side
 * to prevent Next.js from trying to bundle pg and related packages
 */

// Empty stub - database is server-only
export const db = {
  execute: async () => {
    throw new Error('Database is not available on the client side');
  },
  pool: null,
};

// Export empty functions to match the db.ts interface
export async function getTrades() {
  return [];
}

export async function addTrade() {
  return null;
}

export async function getTradeStats() {
  return {};
}

export async function initializeDatabase() {
  return true;
}

export async function deleteModelMessagesBySymbol() {
  return 0;
}

