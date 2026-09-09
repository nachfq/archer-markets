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
| Local contracts | Factory, options, MockUSD, and MockSTOCK were deployed and exercised on Anvil, chain 31337. Local sessions are ephemeral; fresh deployment is required after restarting Anvil. |
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

## Product roadmap and usable-pilot foundation

The coordinating agent implemented the human-approved chain + portfolio direction,
with per-token creation inputs, explicit whole-lot totals, and resale deferred to v2.
The English product specification is in `docs/product-roadmap.md`. Its screen examples
are illustrative, not market quotes or evidence of human validation.

A new `@stock-options-lab/sdk` package owns generated ABIs, complete registry snapshots,
portfolio accounting, exact price conversion, preparation of all v1 actions, simulation,
and structured error decoding. The frontend and seed script consume it. It has no React
or custody dependency. A packed tarball was installed into a separate temporary project;
that project's copied lifecycle example completed calls, puts, cancellation and expiry
recovery using only package exports, viem and a public local deployment manifest.

The web now separates Markets, Portfolio and Activity. Market balances are compact;
Portfolio shows available funds, open-order collateral, active collateral, reclaimable
collateral and total tracked units. It includes all registered positions rather than
only the first 100 chain rows. Shared payment tokens are counted once across markets,
and same-symbol assets are distinguished by market and address. Closed history is
separate from currently open orders and positions. The create screen shows available
funds and exact deposit impact, uses fractional presets and Max, and rejects insufficient
balances and unsupported precision before signing. Max refreshes the complete snapshot
so a recent counterparty transaction is reflected in the result. Suggested expirations
use estimated chain time; validation still checks a fresh block before execution.

Transactions distinguish approval from operation, persist their public hashes and
recover receipts across page reloads. A pending hash does not become failed on timeout.
The UI checks the signing wallet account/network again and resimulates after approval.
Known contract errors have actionable messages; unavailable revert diagnostics are not
invented. Exercise review shows delivery/payment funding, and calendar export provides
an optional reminder without executing the option.

Deployment tooling now prepares an official-token primary factory and a separate
MockSTOCK practice factory, sharing MockUSD. The testnet seed defaults to 0.01 token
and scales its arbitrary example prices exactly. Both factories were deployed locally;
no public transactions were sent. Existing Solidity contracts and financial permissions
remain unchanged. The public testnet factory is still unset and the hosted frontend
has not been republished. Launch still requires a fresh disposable signing wallet,
verified public funding, token provenance and receipts; no exposed key was used.

Validation for this implementation: 26 Solidity tests (including a local TSLA RPC fork),
4 script tests, 9 SDK tests and 12 frontend tests passed: 51 total. Typecheck, lint and
production build passed. The SDK registry regression uses 137 simulated records and
asserts complete reads at one block; it does not claim 137 public transactions. The
four browser transaction scenarios passed with actual Anvil receipts and conservation
checks, plus low-balance prevention, refreshed Max, wrong-wallet-network recovery and
signature rejection. A persisted pending record referencing an actual unmined Anvil
transaction survived a browser reload and reconciled after mining. Connected desktop
and mobile screenshots were inspected; no horizontal overflow appeared in the tested
390px creation view. This is agent verification, not an audit or human usability study.

Limitations: registry refresh remains linear in contract count and depends on RPC
availability. The web selects one chain per build; SDK clients are configurable but
another public EVM chain has not been tested. The Robinhood multiplier is display-only.
Browser Activity is not a complete address history. A transaction replaced while the
browser is offline may require external investigation if its original hash never gets
a receipt. Local history does not follow users to other devices. Public deployment,
human task-based validation, resale v2 and the second-chain trial remain outstanding.

The final read-only visual suite passed at 1440px, 768px, 390px and 720px reflow
(equivalent to 200% desktop layout zoom). Sampled contrast was at least 5.35:1 and
there was no horizontal overflow. Empty-market, RPC failure and recovery also passed.
Two primary-option detail URLs emitted matching call/put metadata without inheriting
the generic site image. Local chain state is reset after acceptance so the coordinator
starts with clean seeded offers; saved test logs describe the pre-reset execution.

## Writer ownership and collateral clarity — September 9, 2026

The coordinating agent revised the market around written options awaiting buyers.
Cards now distinguish the connected writer's premium income from a buyer's premium
cost, display the lot and exercise total, and offer role-specific review actions.
Ownership filters include counts. Own and other-writer quotes are grouped separately
at each strike so a cheaper external listing does not conceal the writer's listing.
The market uses the full registry snapshot, with dates, strikes and additional quotes
progressively disclosed rather than truncating the input to 100 records.

The writing action is now labeled Write option. Review shows the individual option
contract address, agreed collateral amount and its disposition for open, purchased,
expired, exercised, canceled and reclaimed states. Contract accounting and permissions
are unchanged. Approval alone does not transfer collateral. Portfolio's Closed options
explains its onchain contract-state source; Activity explicitly describes device-local
transaction records reconciled with onchain receipts.

Validation: all 51 existing tests, typecheck, lint and production build passed. The
four browser transaction scenarios passed against a separate Anvil fork on port 8546,
including the new ownership filters, role-specific copy, collateral location and
history-source assertions. The coordinator's original Anvil instance on port 8545 was
not reset or used for acceptance transactions during this change. Browser acceptance
receipts from this run describe the isolated local fork, not public transactions.

The visual suite passed desktop, tablet, mobile and reflow checks, sampled contrast
of at least 5.35:1, and empty/offline/recovery states. The additional read-only
`scripts/writer-ux-review.mjs` checked writer and buyer views at 1440px and 390px,
including filter ownership, collateral detail and absence of horizontal overflow.
It derives a display-only writer account from an existing local option and rejects
signing requests. Screenshots in `/tmp/options-writer-ux` were inspected. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using a system Chrome installation.

Limitations: these are agent checks, not a human usability study or security audit.
Collateral copy describes the contract's agreed collateral and lifecycle state, not
a live audit of arbitrary ERC-20 transfers sent directly to its address. Activity is
still device-local and Closed options is not an event-by-event transaction history.
This iteration updates the local frontend; the hosted website was not republished.
