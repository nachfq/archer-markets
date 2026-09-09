# Stock Options Lab product roadmap

## Product decision

Build a comprehensible options chain and portfolio for people who already hold Stock
Tokens. The human coordinator selected chain + portfolio, per-token strike and premium
with visible totals, an official-token pilot plus a separate practice market, and resale
in the second milestone. Preserve fully collateralized calls and puts, whole-lot manual
American exercise, and physical delivery. All repository material remains in English.

| Milestone | Outcome | Exit criterion |
| --- | --- | --- |
| 0: Product definition | Information architecture, representative screen specification, acceptance tasks | Balance, obligation, operation impact and next action are identifiable |
| 1: Usable pilot | SDK, complete portfolio, meaningful errors, official-token testnet market and separate sandbox | Full create/buy/exercise/cancel/reclaim cycle with reconciled balances |
| 2: Resale | New contract version with fixed-price whole-option resale | Payment and holder change are atomic; stale listings cannot be filled |
| 3: More markets | Additional assets and compatibility validation on another EVM testnet | Configuration and token compatibility tests replace frontend rewrites |

This roadmap is a product decision record, not evidence of adoption, user validation,
or a completed public deployment. Implementation evidence belongs in implementation.md.

## Screen specification

Primary navigation: **Markets**, **Portfolio**, **Activity**. Create offer is contextual
to the selected market. A market selector identifies official test tokens and practice
assets separately. Initially show three listed expirations and five strikes; expand
real listings without generating fictitious quotes or liquidity.

Representative layout (illustrative numbers only):

```text
TSLA / MockUSD                         [Market selector] [Wallet]
Your capital
Available in wallet      0.10 TSLA     Available in wallet     100 MockUSD
Open orders              0.03 TSLA     Open orders             20 MockUSD
Active collateral        0.02 TSLA     Active collateral       30 MockUSD
Ready to reclaim         0.01 TSLA     Ready to reclaim         5 MockUSD
Total tracked            0.16 TSLA     Total tracked           155 MockUSD
[Markets] [Portfolio] [Activity]                         [Create offer]
```

`Total tracked` includes collateral backing obligations. It is not liquidation value
or net equity. Only the writer's contractual collateral is attributed to the writer;
buyer rights are positions, not a duplicate token balance. Already-paid premiums are
already reflected in wallet balances. Expired collateral stays outside the wallet until
reclaimed. Donations to option contracts are not attributed as withdrawable collateral.

Creation places the form next to its funding impact (above it on narrow screens):

```text
Covered call / Cash-secured put       What changes for you
Quantity [0.01] [1] [Max]             Available / open / active / reclaimable
Strike per token                     Deposit for this offer
Premium per token                    Available after deposit
Suggested / custom expiry            Premium only if purchased
                                     Total exercise payment
[Approve collateral and create offer]
```

Review separates premium at purchase, tokens delivered at exercise, tokens received,
available exercise funding, and exact deadline. Calendar export is a reminder only.
Maintain visible manual-exercise and no-resale conditions. Stock Token multiplier
metadata must never silently alter fixed contract amounts.

Activity shows transactions from this browser with approval/operation distinction,
receipt state and explorer links. Confirmed positions are discovered from the registry,
not this browser history. Pending approval does not count as collateral. A timeout is
not proof of failure. Unknown transactions remain pending until a receipt is available;
manual wallet replacement during a browser outage may require external investigation.

## Architecture and milestone 1

- Solidity v1 remains unchanged. One factory per token pair; versioned SDK market configs.
- Generated ABIs have one source in the SDK; the web re-exports them.
- SDK uses caller-supplied RPC clients and transaction requests, not custody or keys.
- Registry reads include older contracts, independently of display pagination. Snapshots
  read balances and states at the same block. Failed reads never become zero balances.
- Deduplicate tokens by chain/address. Cache immutable addresses with block-hash checks;
  refresh financial state after receipts. No privileged indexer is required for the pilot.
- Parse decimal inputs exactly; reject totals that cannot fit quote-token precision.
- Preflight funds, permissions, expiration and approvals; resimulate after approval.
  Show stable error codes, useful next actions and optional technical diagnostics.
- Keep deployment provenance, network ID, asset identity and practice labels explicit.

The official pilot starts with the previously configured TSLA test token and MockUSD;
verify its faucet provenance before a public launch. Suggested testnet seed lot: 0.01
raw tokens. Other official assets can follow after compatibility checks. A separate
MockSTOCK factory provides repeatable practice without implying official-token activity.
Stock supplies limit concurrent covered calls; recovered or delivered tokens can be
reused by their current holders. Gas funding is a separate requirement.

## Future versions

Milestone 2 introduces resale listing, cancellation, and atomic purchase by another
holder. Original writer obligations and collateral remain attached to the option.
Exercise, expiry and ownership changes invalidate listings. Cover competing buyers,
stale listings, authorization, failed payment rollback, and exercise/resale races.
Version-1 positions keep their original rights; there is no forced migration.
Detailed v2 contract economics and ABI must be specified before implementing v2.

Milestone 3 adds another EVM testnet and more validated token pairs. Portability does
not imply support for every RWA: transfer restrictions, pausing, balance transformations
and corporate actions require explicit compatibility tests. Non-EVM support is not in scope.

Mainnet, AMM, margin, oracle-based settlement and automatic exercise are outside this
roadmap. Pricing models, synthetic depth and invented trading volume are not substitutes
for user comprehension or real liquidity.

## Acceptance and launch gate

- More than 100 contracts, shared tokens, multiple markets, correct writer/buyer roles.
- Conservation and rollback through create, buy, exercise, cancel and reclaim.
- Tiny fractions, large values, differing decimals, unsupported precision and Max.
- Rejected signatures, low balances, expired/sold offers, changed wallet/network,
  failed RPC, pending receipts, reload recovery and replacement handling.
- A separately installable SDK example completes the lifecycle without web imports.
- Desktop/mobile visual review checks hierarchy, keyboard use, overflow and contrast.
- Human coordinator attempts tasks without guidance: find available funds; locate
  committed collateral; create an affordable offer; explain payment versus exercise;
  recover from an error; reclaim expired collateral. Record actual observations only.
- Run npm test, typecheck and build; ABI regeneration and Anvil E2E for contract changes.

Public launch requires a fresh disposable wallet with verified public testnet funds,
verified token provenance and successful deployment receipts. Do not reuse a secret
shared in conversation. The bridge deposit remains unverified without its public
transaction hash. Publish the frontend with the validated deployment manifest and retain
its existing access level. A hosted frontend alone is not a funded contract demo.

References: [Robinhood integration](https://docs.robinhood.com/chain/building-with-stock-tokens/),
[bridge documentation](https://docs.robinhood.com/chain/bridging/),
[viem simulation and error decoding](https://viem.sh/docs/contract/simulateContract).
