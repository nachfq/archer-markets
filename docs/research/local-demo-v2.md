# Five-market local fixture and resale (current contracts: V3)

Historical fixture design. The current [local guide](../demo.md) reserves accounts 0–1
for players and uses accounts 2–9 for 390 options and 150 buy requests. The account
allocation, ledger filename and native Anvil commands below describe the earlier setup.

This guide generates synthetic local chain-31337 fixtures, not a funded Robinhood deployment,
an audit, or human usability validation. The hosted chain-46630 frontend remains
without a factory. The fixture generator does not publish the frontend.

## Start or resume

This filename is retained from the V2 milestone. New runs deploy V3; use fresh manifest and ledger paths rather than resuming V2 deployment records with V3 source.

Keep Anvil running in a separate terminal. For a fresh node, or the existing local
demo, run from the repository root:

```sh
npm run contracts:build
npm run abi
npm run sdk:build
npm run demo:local -- --dry-run
npm run demo:local
npm run dev:local
```

`demo:local` obtains unlocked addresses through `eth_accounts` and only sends from
indexes 1–9. It never signs with account 0, resets the chain, changes its clock, or
buys existing human-created offers. It requires loopback, chain 31337, Anvil and
ten distinct unlocked accounts. Never use these development accounts publicly.
The script deploys five named tokens and V3 factories from account 1, reusing a
valid local MockUSD or deploying one when needed. Existing deployed primary and
practice factories remain legacy Portfolio assets and retain their option links.

Use `--deploy-only` and `--seed-only` to split stages. The ignored
`deployments/local-demo-v2.json` records transaction intents, nonces, hashes and
individual fixtures. A rerun recovers interrupted submissions and skips completed
fixtures, including any subsequently changed by a human. It does not reset their
state. Do not run two seed processes concurrently or reuse their actor accounts
while seeding. An ambiguous/replaced nonce stops the run for inspection.

`ANVIL_RPC_URL`, `DEMO_MANIFEST` and `DEMO_LEDGER` select a separate node and evidence
files; `--no-export` avoids changing the frontend manifest during isolated tests.
After starting a genuinely new chain, choose a fresh ledger path. Old ledgers are
not evidence that their contracts still exist; the script rejects mismatched nodes.
Do not discard a ledger to reseed the same node: that would create another series.

## Synthetic reference prices

Rounded reference snapshot: **September 9, 2026**. Source links are stored in
`scripts/demo-config.mjs`; these are not live feeds.

| Token | Name | Rounded reference, USD |
|---|---|---:|
| mTSLA | Mock Tesla | 370 |
| mNVDA | Mock NVIDIA | 225 |
| mAAPL | Mock Apple | 315 |
| mAMZN | Mock Amazon | 250 |
| mMSFT | Mock Microsoft | 490 |

Each market has 78 independent options: three Friday 16:00 New York deadlines
at least 7, 30 and 90 days out; 11 strike references from −25% to +25% in 5% steps,
rounded to multiples of USD 5; both calls and puts. Quantities cycle through 0.1,
0.5, 1, 2 and 5 tokens. At each at-the-money strike, each side has 0.1, 1 and 5-token
offers so the expandable-lot comparison can be tested.

The illustrative per-token premium is intrinsic value plus
`reference × 0.06 × sqrt(days / 30) × exp(-3 × abs(strike / reference - 1))`.
The whole-option premium is then multiplied by quantity and rounded to cents, with
a one-cent minimum. Exercise totals use the selected strike times quantity. This
heuristic is deliberately not an options valuation or an executable market quote.

Across 390 contracts: 360 unsold primary offers, 10 held purchased rights, 10
purchased rights listed for resale at 115% of original premium, and 10 canceled
offers. Thus 370 offers initially appear across the five chains. Faucets create
synthetic collateral and payment balances for accounts 1–9 only.

## Resale semantics

Resale transfers the existing contract's `buyer` (current holder), not its writer
or collateral. `listForResale(totalPrice)` also edits a listing; `cancelResale()`
withdraws it. `buyResale(expectedSeller, expectedPrice, expectedNonce)` pays the
seller and transfers the complete right atomically. Nonces invalidate stale quotes.
Exercise remains possible while listed and clears the listing; expiry disables
resale/exercise and the writer can reclaim. Failed exact-token transfers roll back
ownership, state, listing and payments. No fees, partial lots, NFTs or free transfers
are introduced. The original writer cannot buy back their own option in this PoC.

The UI shows new and resale offers in the same strike groups, sorted by quantity
then total asking price. Every row remains a separate whole option. Portfolio
keeps past holders in history and shows actual purchase/resale payments. Legacy
V1 contracts remain usable for their existing lifecycle but cannot gain resale.

## Safe integration checks

Tests that advance time belong on a separate node, never the user's active 8545:

```sh
anvil --host 127.0.0.1 --port 8546 --chain-id 31337 --fork-url http://127.0.0.1:8545 --silent
# In another terminal, after the local five-market deployment exists:
ANVIL_RPC_URL=http://127.0.0.1:8546 npm run test:e2e
ANVIL_RPC_URL=http://127.0.0.1:8546 npm run test:browser
```

The browser test forwards frontend RPC requests to the isolated node and uses
accounts 1, 8 and 9. It rejects the default live port unless deliberately overridden
with `ALLOW_LIVE_BROWSER_MUTATIONS=1`; that override is not needed for normal QA.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an installed Chrome rather than
Playwright's downloaded Chromium, and `BROWSER_BASE_URL` for another local preview.
