# Open House Singapore submission path

Updated September 20, 2026. This is the engineering path from the V4 local PoC to a
reviewable submission. It is not evidence of a public deployment or competition result.

## Positioning

**Archer Markets is a fully collateralized Stock Token options market with an entirely
onchain price/time orderbook, manual American exercise and physical token delivery.**
One order covers one token, creates or transfers one independent option, and executes
at most one full match at the resting price. Resales share the same book.

The implementation remains Solidity. The event accepts Solidity and requires deployment
on an Arbitrum chain; Robinhood Chain is an eligible target.
[Official event listing](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon).

## Release sequence

1. **Release candidate:** make V4 the canonical branch, close repository quality gates,
   run the V4 acceptance suite in private CI, and tag a release candidate.
2. **Public repository:** review history, secrets, license, generated files and release
   notes before changing visibility. Verify a clean anonymous checkout.
3. **Robinhood testnet:** deploy and verify V4 with disposable wallets, then record a
   two-wallet call, put, resale, cancellation and physical exercise with exact balances.
4. **Public frontend:** publish only the manifest that passed testnet acceptance. Test
   an anonymous browser, a real wallet, wrong-network recovery and explorer links.
5. **Submission package:** publish a short demo, architecture diagram, exact revision,
   contract addresses, reproduction commands and concise security limitations.

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
