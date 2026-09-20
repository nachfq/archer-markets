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

## Release roadmap

The immediate objective is to turn the working V4 implementation into a reproducible
release candidate, then publish each layer in a controlled order.

| Phase | Outcome | Exit gate |
| --- | --- | --- |
| V4 release candidate | Canonical source, generated artifacts, tests, builds and browser acceptance agree on V4 | Private CI is green on `v0.1.0-rc.1` |
| Repository publication | Reviewable public source with intentional history, license, release notes and no exposed secrets | Anonymous clone and documented checks succeed |
| Robinhood testnet deployment | Verified V4 contracts, public receipts and a small reproducible market | Two-wallet lifecycle and balance reconciliation pass |
| Frontend publication | Public UI reads the verified manifest and safely handles unavailable transactions | Anonymous browser and real-wallet smoke tests pass |
| Hackathon submission | Concise pitch, demo video, explorer links, repository and limitations tell one consistent story | Every submitted link works without private access |

Phases are sequential. A public website is not published against an unverified manifest,
and submission materials do not claim evidence from a later phase.

The V4 release-candidate gate passed on `v0.1.0-rc.1`. Repository cleanup and private
publication preflight are in progress; visibility remains private. See the
[publication preflight](publication-preflight.md) for the final human decisions and
visibility checkpoint.

### Branches and releases

- Stabilize V4 on `release/hackathon-v4` while the repository remains private.
- Squash the approved candidate into `main` so the public default branch starts from one
  reviewable V4 release commit after the repository's initial commit.
- Tag the private baseline as `v0.1.0-rc.1`; use `v0.1.0` only after the public testnet
  deployment and matching frontend have passed acceptance.
- Keep feature branches out of the public release surface unless they contain evidence
  that is intentionally preserved.

## Product boundary

Keep V4 fully collateralized, oracle-free, manually exercised, and physically settled.
Do not add partial fills, batches, margin, an AMM, centralized matching, automatic
exercise, or mainnet deployment without a separate decision. Existing V1–V3 positions
are historical research artifacts and are not supported by the current product.

See [how it works](../how-it-works.md), the [local demo](../demo.md), and the
[implementation record](implementation.md). Historical research remains evidence for
its stated date and scope, not proof of current demand.
