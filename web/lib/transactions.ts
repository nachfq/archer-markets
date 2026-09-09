import type { Address, Hash } from 'viem';
export type TransactionRecord = { hash: Hash; account: Address; chainId: number; marketId: string; action: string; step: 'approval' | 'operation'; status: 'pending' | 'confirmed' | 'reverted' | 'replaced'; createdAt: string; replacement?: Hash };
const key = 'stock-options:transactions:v1';
export function readTransactions(): TransactionRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((x): x is TransactionRecord => !!x && /^0x[0-9a-fA-F]{64}$/.test(x.hash) && /^0x[0-9a-fA-F]{40}$/.test(x.account) && Number.isSafeInteger(x.chainId) && typeof x.marketId === 'string' && typeof x.action === 'string' && ['approval', 'operation'].includes(x.step) && ['pending', 'confirmed', 'reverted', 'replaced'].includes(x.status) && typeof x.createdAt === 'string');
  } catch { return []; }
}
export function writeTransactions(records: TransactionRecord[]) {
  try { localStorage.setItem(key, JSON.stringify(records)); } catch { /* Transaction tracking remains in memory when storage is unavailable. */ }
}
