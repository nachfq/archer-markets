# Implementation record — 2026-09-09

## Human decisions

The human coordinator proposed a puts/calls factory over Robinhood Chain RWAs,
confirmed **physical token delivery** for the first PoC, and requested implementation.
No human code review or demand validation is recorded. The coordinator subsequently
requested English throughout the repository while retaining Spanish conversation,
and asked for a local testing path before testnet deployment.

## Agent contributions

| Agent | Responsibility | Result |
|---|---|---|
| `/root` | Integration, deployment tooling, documentation, and final review | Network CLI, manifests, ABIs, demo, documentation, and combined validation |
| `options_contracts` | Contracts and adversarial testing | Factory, options, mocks, 25 local tests, and optional fork test; fresh-install validation; English README and operational documentation |
| `options_frontend` | Application and wallet integration | Market, creation, positions, approvals, and transaction management |
| `options_e2e` | Independent workflows and review | 9 scenarios / 460 checks with Anvil transactions; discovery of advance-donation factory denial of service |

Independent review found that donating tokens to the predictable address of the next
option could block the factory if funding required an exact balance. The activation
check now requires sufficient collateral, while preserving the exact transfer delta
required from the writer. A regression test covers both calls and puts. Unsolicited
surplus is outside the agreed lot and has no rescue mechanism.

## Executed evidence

- 25 local Foundry tests, including 256 fuzz inputs, permissions, repeated calls,
  expiration, fee-on-transfer tokens, and reentrancy.
- Independent Anvil workflow: 9 scenarios and 460 checks, with receipts, timestamps,
  and balances recorded in `deployments/local-smoke.json`.
- Robinhood RPC fork: calls and puts executed against the existing TSLA implementation,
  including `approve` and `transferFrom`. Balances were prepared with `deal`
  **on the local fork**. No public tokens were obtained and no contracts were deployed
  to testnet by this test.
- Operational scripts: rejection of mainnet RPC configuration and protection of private
  information when exporting browser manifests.
- Functional browser testing: 4 workflows using two local wallets—call and put from
  creation through exercise, cancellation, and expired collateral recovery. Tests used
  buttons, approvals, and a shared link, with independently checked balances and states.
  No browser execution errors occurred. Evidence is in
  `deployments/local-browser-smoke.json`. EIP-1193 providers were local fixtures, not
  third-party wallet extensions or public wallets.
- Final implementation suite: 26 Solidity tests including the fork, 3 script tests,
  4 UI-logic tests, and successful typecheck and build. Chromium revision 1234 was used
  for acceptance; the reproducible installation command installs the browser revision
  corresponding to the Playwright version pinned in the lockfile.
- Fresh Solidity dependency installation was checked in an isolated temporary copy,
  without `.env` or existing libraries: 25 tests passed and the fork test skipped.
  The included CI workflows have not yet run on GitHub; their commands were checked locally.

The subsequent README, coordination-guide, and operational-document translation is a
documentation-only change. It does not constitute another execution of the tests above.

## Expiration experience iteration

The coordinating agent added Friday and third-Friday monthly expiration suggestions
at 16:00 New York time, custom expiration, exact UTC previews, and 100-token/1-token
quantity shortcuts. Suggested dates account for daylight saving but intentionally
do not claim exchange-calendar or holiday alignment. Quantity, premium, and exercise
payment retain their existing raw-token/whole-lot semantics.

The offer detail now prominently explains manual exercise, the loss of the right at
expiry, and the lack of automatic payouts or premium refunds. Purchase requires a
UI acknowledgment bound to the connected account and option. Expired rights are
explained even before collateral has been reclaimed. Creation validates its deadline
against a fresh chain timestamp. The form can also preview terms when the testnet
factory is unconfigured, with transactions disabled.

See [expiration and settlement](expiration-and-settlement.md) for the distinction
between this oracle-free physical-delivery PoC and a potential future settlement
contract. No oracle, keeper, admin permission, or contract behavior changed.

Validation for this iteration: all 26 Solidity tests (including the local TSLA fork),
3 script tests, and 8 frontend logic tests passed. Typecheck, lint, and the production
build passed. The four browser transaction scenarios passed with added checks that
the 100-token shortcut fills the quantity, purchase is disabled until acknowledgment,
and both suggested and custom deadlines are stored exactly onchain. These browser
tests use local Anvil wallet fixtures; no public-chain transactions were sent.
Changes are available in the local app; the previously published site has not been
updated during this iteration.

## Trading interface iteration

The coordinating agent replaced the landing-page hero with a compact dark trading
workspace. The default Options chain pairs calls and puts around a strike column,
with listed expiration tabs and a trade ticket for the selected contract. Creation
is a secondary tab and My positions retains the complete position lifecycle.

The chain initially shows three expirations and five strikes, with expansion for
additional listings. It never synthesizes two years of empty series. Any future
timestamp already supported by the contracts can appear when an actual offer exists.
Unavailable deployments show the empty trading surface with transactions disabled.

Strikes are grouped and sorted as exact bigint ratios so different lot sizes with
the same per-token strike can share a row. Individual offers are never aggregated
into a fictitious order book. The lowest per-token ask is shown first; other offers
in that cell can be expanded. Premiums and strikes are displayed per token, with
an approximation marker where needed. Execution always uses the original whole-lot
integer amounts, reviewed in the ticket. Distinct timestamps remain separate even
on the same calendar date; dates include their UTC time.

The current buyer cannot transfer or resell an option: the contract only sets buyer
at purchase and requires that buyer for exercise. This iteration explicitly labels
the primary-only market and does not implement a secondary market. That feature
would require a new contract version with atomic right/payment transfer, expiry and
exercise race handling, listing invalidation, and authorization tests.

The social card was generated once for the new visual direction, inspected, and
saved as `og-trading.png`; the previous asset remains available. Individual-option
metadata still clears inherited images. The hosted site remains on its previously
published version; this iteration updates the local repository and local app.

Validation: 26 Solidity tests (including the local TSLA fork), 3 script tests, and
11 frontend logic tests passed, along with typecheck and lint. All four browser
transaction scenarios passed; purchase now starts by selecting a listed expiration
and quote from the chain before reviewing the ticket. The production build passed.
No public-chain deployment or secondary-market execution is claimed.

## Light UI and occasional-investor experience

The human coordinator selected an occasional-investor audience and a soft light
theme. The coordinating agent implemented a gray-green page background, white
surfaces, slate text, and forest-green actions. Body text is 16px, table labels and
controls 14px, and auxiliary copy at least 12px. Semantic CSS variables define the
palette; controls have visible borders and keyboard focus.

The Options screen now makes total premium and token quantity primary, with per-token
premium secondary. Strike remains the exercise price per token. Exact string-based
number grouping preserves all digits, including large integers and tiny fractions.
The review separates You pay now, Your right, and Exercise before, keeps the manual
exercise/no-resale conditions visible, and moves technical information under Contract
details. Approval, signature, receipt, and error messages appear next to the operation.
Wallet balances and faucets are under Wallet & test funds. Mobile has a call/put
selector and a dedicated review view; returning restores focus to the selected offer.

Validation: 26 Solidity tests, 3 script tests, and 12 frontend logic tests passed.
Typecheck, lint, and production build passed. Four transaction flows passed, plus
wrong-wallet-network recovery and rejected-signature retry; rejection left option
state and token balances unchanged. No public transactions were sent.

`scripts/ux-browser-review.mjs` captured and checked 1440px desktop, 768px tablet,
390px mobile, and 200%-equivalent desktop viewport reflow with doubled device scale.
It verifies minimum visible font size, horizontal overflow, keyboard selection/focus
restoration, call/put switching, empty markets, RPC failure, and connection recovery.
Measured sampled text contrast was at least 5.35:1; tested views had no horizontal
overflow and no text below 12px. This is targeted UI verification, not a full WCAG
certification or a completed human usability study. Screenshots and JSON evidence
are saved outside the repository at `/tmp/options-ux-review` by default.

Design references: [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html),
and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
The social card was generated once, inspected, and saved as `og-light.png`. Delivery
is local only; the published site and smart-contract interfaces are unchanged.

## Integration contract

The factory fixes `underlying` and `quote`.
`createOption(type, quantity, strikeTotal, premium, expiry)` creates an option and
escrows collateral atomically. States are `Open=0`, `Active=1`, `Exercised=2`,
`Cancelled=3`, and `Expired=4`.

Each option exposes `buy`, `exercise`, `cancel`, and `reclaimExpired`; terms and
participants are queried onchain. `npm run abi` exports the compiled ABI rather than
a manually maintained copy. Network manifests contain public addresses, deployment
block, and token metadata. The exercise payment is a **total for the entire lot**,
expressed in MockUSD base units.

## Deployment status and remaining external work

| Component | Evidence and current status |
|---|---|
| Published frontend | Private website deployment succeeded; configured for Robinhood testnet, chain 46630. |
| Public testnet contracts | Browser manifest has `factory: null` and an unset MockUSD address. No funded public contract demo is claimed. |
| Local contracts | Factory, options, MockUSD, and MockSTOCK were deployed and exercised on Anvil, chain 31337. Anvil was stopped after validation; fresh deployment is required after restarting it. |
| TSLA compatibility | Actual TSLA implementation exercised on a local RPC fork with synthetic balances; no public transactions. |

Test ETH is still needed to deploy publicly, and test TSLA is needed to seed calls.
The faucet returned a rate limit from this environment. The deployer key was generated
locally and is stored only in ignored `.env`; obtain its public address with
`npm run check:testnet`.

Do not present a web build, mock-token test, or RPC fork as a Robinhood contract
deployment. [The local walkthrough](demo.md) provides the complete manual test before
funding testnet accounts. Website publication and contract deployment are separate actions.

## Frontend publication

Version 1 was published with private access at
[https://stock-options-lab.nachofq.chatgpt.site](https://stock-options-lab.nachofq.chatgpt.site).
The hosting service reported `succeeded`. That version uses Robinhood testnet
configuration with the factory pending. The functional demo with deployed contracts
runs locally following the README. Publishing the website did not deploy contracts;
a later contract deployment also requires publishing updated frontend configuration
before the hosted website can use it.

Call and put link metadata was also validated: it reflects onchain terms and does not
inherit the site's generic image. The main image was generated with imagegen and
inspected before inclusion.
