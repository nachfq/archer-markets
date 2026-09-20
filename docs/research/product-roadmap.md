# Product roadmap

## Current product thesis

Archer Markets helps Stock Token holders protect downside with puts or earn
premiums with covered calls through a fully collateralized, physically settled
onchain options market.

The first user is an existing Stock Token holder. The product serves two initial
jobs:

- Buy a protective put to define a minimum sale price before expiration.
- Write a covered call against a token already held to earn a premium.

The complementary user is a writer willing to fund the complete obligation. The
protocol does not yet assume that either side has been validated or that a liquid
market exists.

## Why this belongs onchain

The chain holds collateral, enforces the exercise exchange, and makes matching
rules independently verifiable. V4 keeps the complete price/time orderbook onchain;
crossing limits execute atomically at the resting price, with no privileged matcher.
Each order covers one Stock Token and creates or transfers one independent option.

Archer's initial distinction is the combination of:

- Full collateral rather than margin or unsecured promises.
- Physical Stock Token delivery rather than oracle-based cash settlement.
- Transparent price/time priority rather than centralized matching.
- One independent option per match, with resale in the same orderbook.

This is a focused trust model, not a claim that onchain execution creates demand or
liquidity by itself.

## Product risks and tradeoffs

- Full collateral reduces counterparty risk but is capital-intensive for writers.
- One option per order keeps custody and settlement legible but is not yet designed
  for high-volume professional execution.
- Exercise and expired-fund recovery are manual transactions; a missed deadline can
  extinguish a right.
- A new market has a cold-start problem on both sides of the book.
- Corporate actions and the Stock Token `uiMultiplier` are not incorporated into
  contract terms. The PoC must not imply automatic adjustment.
- Token restrictions, freezes, upgrades, or non-exact transfers can prevent an
  otherwise valid lifecycle.

## Current phase — product thesis

This phase is complete when the team can state consistently:

1. The initial user and the job Archer improves.
2. Why collateral, matching, and delivery benefit from onchain enforcement.
3. How Archer differs from a broker option, covered-call vault, and structured product.
4. Which tradeoffs are intentional in the PoC.
5. Which observations would support, change, or reject the thesis.

The next validation should test these hypotheses:

- Stock Token holders recognize downside protection or covered-call income as a
  relevant task, rather than a feature looking for a user.
- They understand premium, strike, collateral, expiration, manual exercise, and
  physical delivery without relying on traditional brokerage assumptions.
- At least one plausible writer type accepts full collateral in exchange for the
  premium and transparent terms.
- The onchain guarantees matter enough to justify wallet, gas, and deadline friction.

Reject or narrow the thesis if target users prefer spot exit, existing broker options,
or managed vaults and cannot identify a meaningful benefit from self-custodied physical
delivery. Do not interpret seeded orders, local transactions, or interviews as adoption.

## Later phases

| Phase | Outcome | Entry condition |
| --- | --- | --- |
| Human validation | Interviews and unassisted walkthroughs test the four hypotheses above | Product thesis is stable |
| Technical and demo hardening | V4 review, repository quality gates, and a clear local demonstration | Validation identifies a workflow worth preserving |
| Public testnet and submission | Verifiable deployment, matching frontend, and accurate submission materials | Local product and technical gates pass |

These phases are intentionally sequential. Work planned for a later phase should not
be pulled into the current iteration without a new human product decision.

## Product boundary

Keep V4 fully collateralized, oracle-free, manually exercised, and physically settled.
Do not add partial fills, batches, margin, an AMM, centralized matching, automatic
exercise, or mainnet deployment without a separate decision. Existing V1–V3 positions
retain their original management paths.

See [how it works](../how-it-works.md), the [local demo](../demo.md), and the
[implementation record](implementation.md). Historical research remains evidence for
its stated date and scope, not proof of current demand.
