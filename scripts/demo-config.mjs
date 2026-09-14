// Rounded reference snapshot, not live quotes or a valuation model.
export const priceSnapshotDate = '2026-09-09';
export const demoStocks = [
  { id: 'tesla', name: 'Mock Tesla', symbol: 'mTSLA', anchor: 370, source: 'https://www.google.com/finance/quote/TSLA:NASDAQ' },
  { id: 'nvidia', name: 'Mock NVIDIA', symbol: 'mNVDA', anchor: 225, source: 'https://www.google.com/finance/quote/NVDA:NASDAQ' },
  { id: 'apple', name: 'Mock Apple', symbol: 'mAAPL', anchor: 315, source: 'https://www.google.com/finance/quote/AAPL:NASDAQ' },
  { id: 'amazon', name: 'Mock Amazon', symbol: 'mAMZN', anchor: 250, source: 'https://www.google.com/finance/quote/AMZN:NASDAQ' },
  { id: 'microsoft', name: 'Mock Microsoft', symbol: 'mMSFT', anchor: 490, source: 'https://www.google.com/finance/quote/MSFT:NASDAQ' },
];
export function demoExpirations(timestamp) {
  return [7, 30, 90].map(days => {
    const date = new Date((Number(timestamp) + days * 86400) * 1000);
    date.setUTCDate(date.getUTCDate() + (5 - date.getUTCDay() + 7) % 7);
    date.setUTCHours(16, 0, 0, 0);
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(date));
    return BigInt(Math.floor((date.getTime() + (16 - hour) * 3600000) / 1000));
  });
}
export function demoOffers(stock, timestamp, expirations = demoExpirations(timestamp)) {
  const offers = [];
  for (const [term, expiry] of expirations.entries()) for (let step = -5; step <= 5; step++) for (const kind of [0, 1]) {
    const strike = Math.round(stock.anchor * (1 + step * 0.05) / 5) * 5;
    const quantities = step === 0 ? [1, 0.1, 5] : [[0.1, 0.5, 1, 2, 5][(step + 5 + term + kind) % 5]];
    for (const [lot, quantity] of quantities.entries()) {
      const days = Number(expiry - BigInt(timestamp)) / 86400;
      const intrinsic = Math.max(0, kind === 0 ? stock.anchor - strike : strike - stock.anchor);
      const timeValue = stock.anchor * 0.06 * Math.sqrt(days / 30) * Math.exp(-3 * Math.abs(strike / stock.anchor - 1));
      const premium = BigInt(Math.max(1, Math.round((intrinsic + timeValue) * quantity * 100))) * 10000n;
      offers.push({ id: `${stock.id}-${term}-${step}-${kind}-${lot}`, optionType: kind, quantity: BigInt(Math.round(quantity * 10)) * 10n ** 17n, strikeTotal: BigInt(Math.round(strike * quantity * 100)) * 10000n, premium, expiry });
    }
  }
  // Exactly two held, two relisted and two cancelled per market, away from the first expiry.
  return offers.map((offer, i) => ({ ...offer, disposition: i === 52 || i === 53 ? 'held' : i === 54 || i === 55 ? 'resale' : i === 76 || i === 77 ? 'cancelled' : 'open', writerIndex: 1 + i % 7, buyerIndex: 8 + i % 2 }));
}
export function assertLocalDemo(url, chainId, clientVersion, accounts) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || chainId !== 31337 || !clientVersion.toLowerCase().includes('anvil')) throw new Error('Demo writes require a loopback Anvil RPC on chain 31337.');
  if (accounts.length < 10 || new Set(accounts.map(a => a.toLowerCase())).size !== accounts.length) throw new Error('Ten distinct unlocked Anvil accounts are required.');
  return accounts.slice(1, 10);
}
