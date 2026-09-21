# Open House Singapore submission path

Updated September 21, 2026. This records the completed V4 public testnet release and the
remaining path to a reviewable submission. It is not evidence of a competition result.

## Positioning

**Archer Markets is a fully collateralized Stock Token options market with an entirely
onchain price/time orderbook, manual American exercise and physical token delivery.**
One order covers one token, creates or transfers one independent option, and executes
at most one full match at the resting price. Resales share the same book.

The implementation remains Solidity. The event accepts Solidity and requires deployment
on an Arbitrum chain; Robinhood Chain is an eligible target.
[Official event listing](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon).

## Current release status

1. **Complete:** V4 is canonical, licensed under MIT and covered by contract, invariant,
   SDK and browser acceptance tests.
2. **Complete:** five V4 markets are deployed and source verified on Robinhood Chain
   Testnet, use native Stock Tokens and USDG, and expose illustrative public liquidity.
3. **Complete:** the transaction-enabled frontend is hosted publicly on Railway and has
   been used with a real wallet to post orders.
4. **Complete:** one coordinated, public two-wallet AMD call matched and exercised with
   exact fee, collateral and token balance reconciliation. This demonstrates the call
   lifecycle, not independent adoption. Public put exercise, cancellation and resale
   would be useful secondary evidence but are not prerequisites for this claim.
5. **Remaining:** publish the reviewed repository, verify a clean anonymous checkout,
   and submit a short demo, architecture diagram, exact revision, explorer links,
   reproduction commands and concise security limitations.

The listing currently shows registration through October 2, 2026 and submission through
October 4, 2026. Confirm the cutoff timezone and private form fields in the signed-in portal.

## Three-minute V4 demonstration

- **0:00–0:25:** Explain the Stock Token protection/covered-call use case and identify
  the network, assets and test-only status.
- **0:25–1:05:** Show two equal-price asks and one better-limit buy. The oldest ask fills
  once at the resting price while the second remains in the book.
- **1:05–1:45:** Show the independent option, writer collateral, holder and exact premium.
- **1:45–2:25:** Resell or exercise the option and reconcile Stock Token and payment-token
  balances for both wallets.
- **2:25–3:00:** Cancel an unmatched bid, show its refund, then summarize the no-oracle,
  no-privileged-matcher design and its capital-efficiency and manual-exercise tradeoffs.

Use a small fixture rather than the optional 390-order synthetic market. Label the network
of every recording and keep a recorded local fallback separate from public-chain evidence.

## Deliberate exclusions

Do not add Stylus, oracle settlement, an AMM, partial fills, batches, margin, automatic
exercise or mainnet for this submission. These change the product or trust model and are
not required to demonstrate the V4 orderbook and physical-delivery lifecycle.
