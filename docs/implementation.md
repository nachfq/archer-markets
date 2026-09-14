# Implementation record

Current status: V3 whole-fill requests are repository/local development. There is no
configured Robinhood testnet protocol deployment or public V3 acceptance run. Earlier
sections are dated historical reports, not a claim that a local node is running today
or that its saved addresses exist on testnet. See the latest V3 entry below.

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

## Compact trading workspace — September 9, 2026

The human coordinator selected a dark thinkorswim-web-inspired direction for users
familiar with trading, with buying and writing equally accessible. The implementation
now uses graphite/slate surfaces, restrained green accents, compact offer rows, and
Trade / Portfolio / Activity navigation. Trade has a Buy / Write dropdown; expiration,
strike count (5, 10, all), and writer ownership are dropdowns. Each offer retains its
individual lot, total premium, per-token comparison, and ownership. Additional offers
remain expandable and the SDK still supplies the complete registry.

The ticket opens only for a selected option. It shows exact whole-lot costs, exercise
delivery and deadline; technical details, collateral location, copy actions and
calendar export are collapsed. Exercise and no-resale conditions stay visible.
Portfolio is a position table with role-specific review actions and status/type
filters. Capital is under Balances & collateral. The wallet menu contains funds,
faucets and disconnect; Activity is a compact browser-local receipt table.

Writing now follows terms, Review offer, then Deposit collateral & write option.
Reviewing does not send transactions. Editing terms clears review, market changes
clear terms and selection, and final submission still rechecks the wallet, chain,
collateral and simulation through the existing SDK. Mobile presents review separately
from the form or chain, restoring keyboard focus when returning. Shared option URLs
and browser back/forward remain supported. Contracts, SDK calculations, token units,
deployment manifests, dependencies and permissions were not changed.

Validation: all 51 existing tests passed (26 Solidity, 4 deployment-script, 9 SDK and
12 frontend tests), including conservation and rollback coverage. Typecheck, ESLint
and the chain-46630 production build passed. The browser smoke passed call and put
purchase/exercise, unsold cancellation and expired collateral reclaim using actual
receipts on an isolated local Anvil fork at port 8546. It also verified that review
leaves factory count and balances unchanged, insufficient-collateral prevention,
refreshed Max, wrong-network recovery, signature rejection without state or balance
changes, and a pending transaction reconciled after mining. The original port-8545
demo was not reset or used for acceptance transactions.

The read-only visual suite passed at 1440, 768, 390 and 720px reflow, with no horizontal
overflow and sampled text contrast of at least 5.82:1. It covers buy/write review,
focus restoration, edit invalidation, market reset, empty markets and RPC recovery.
Writer/buyer inspection also passed on desktop and mobile. The new
`scripts/workspace-review.mjs` checks root and call/put detail metadata, browser
history, strike controls and a locally served production build with the unconfigured
testnet manifest. Connected wallet fixtures cannot sign; submission stays disabled
without a factory on desktop and mobile. No public transactions were sent.

Sites configuration was preserved. The existing hosted frontend was not republished.
The checked local preview is available through the existing development server.
Screenshots and transaction evidence are local test artifacts, not human usability
validation, an audit, public deployment evidence, or market adoption.

The Sites workflow also prompted a social-preview update. The built-in image tool
generated a card and one corrective edit; the first candidate's unsupported bid/ask
labels and extra slogans were removed. The accepted 1536×1024 raster is
`web/public/og-workspace.png`, used only by root metadata. Existing images are
preserved, and individual option URLs continue to clear the root image.

Final built-in image-edit prompt:

> Edit this social card. Keep the graphite/slate/green palette, main typography and layout. Remove all extra invented words. The only text anywhere in the entire final image must be exactly: 'Stock Options Lab', 'Trade. Write. Manage.', 'Fully collateralized Stock Token options', 'Testnet only', 'Trade', 'Portfolio', 'Activity'. Delete the entire bottom footer with its three icons and slogans. Delete the small slogan underneath the headline. In the right-hand table, delete ALL column labels, dropdown labels and all small text including Bid, Ask, Symbol, Expiration, Strategy, Calls, Puts, Strike. Leave only tasteful abstract fine grid lines and horizontal dashes, no labels and no numbers. Remove the flask icon. Do not introduce any new icons, words, claims or labels. Only the seven specified text strings may appear. This product has no bid/ask order book, so do not represent one with labels. The table must be abstract linework only. Keep it clean and spacious.

## Visible trading flows and inline portfolio — September 9, 2026

Implemented the coordinator's second UI iteration while retaining the graphite/slate
palette and existing social image. Markets now use an owner-ordered right rail
(horizontal below 1024px); Buy Options and Write Options are visible segmented
buttons. Expirations are chronological scrollable buttons with UTC dates, remaining
time and full-deadline tooltips. Strike count sits in the strike header and defaults
to 10. Own and other offers share premium-unit ordering without ownership filters
or a Yours badge; own offers use tint, a writer icon and Manage.

Review separates whole-lot premium, exercise delivery/right, and expiration.
Premium and strike comparisons reuse bigint per-token math, never share counts,
breakeven or effective-price estimates. Totals and transactional amounts are unchanged.
Portfolio balances are visible Stock Tokens and Stablecoins tables. Every curated
asset has a row, including zero holdings; unknown or failed balances show a dash.
Shared quote tokens deduplicate by chain/address, not symbol. Positions retain
filters and rows while a single inline review expands; strike and premium per token
are included. Financial snapshots are shared across selected markets so expanding
another market's position does not discard the table while refetching.

The frontend catalog is `web/lib/catalog.ts`. Edit the chain-specific ordered
`marketCatalog` entries to choose visible manifest market IDs and asset names,
classification and optional logos. Put individual logos in `web/public/` and set
the corresponding presentation's `logo` to its public-root path. Missing or failed
images use the generic stock/coin icon. Font Awesome Free 6.7.2 is pinned and
self-hosted; no CDN or new generated imagery is used. Existing manifests remain the
address/deployment source. Listing an asset does not create a factory or enable
transactions, and unlisted markets are outside this frontend's discovery scope.

Docs includes linked explanations of buying, writing, exact approvals, manual
American exercise, physical delivery, expiration/recovery, prices, portfolio
provenance and testnet limits. The warning has a font icon and a direct link to
`?view=docs#manual-exercise`; returning preserves the draft or selected option.
The former footer guide was removed. Portfolio detail URLs use `view=portfolio`;
Copy link emits a canonical Trade option URL usable by another wallet. Existing
option links remain supported. Navigation and row/filter guards prevent changing
transaction context while an operation is pending.

Validation: 55 tests passed (26 Solidity, 4 deployment-script, 9 SDK, 16 frontend),
including new catalog identity/visibility and unit-price cases. Typecheck, ESLint
and the chain-46630 production build passed. Browser acceptance covers call/put purchase and exercise, cancellation,
expired reclaim, exact balance conservation, rejected signatures and receipt
reconciliation. These transactions use an isolated loopback Anvil fork on port 8546,
not the original 8545 demo. The smoke fixture creates an additional local writer
offer to check mixed ownership deterministically; these setup transactions are
recorded separately from UI actions.

Read-only browser checks passed at 1440, 768, 390 and 720px reflow: sampled text is
at least 14px, sampled contrast is at least 5.82:1, and pages have no horizontal
overflow (wide tables scroll internally). Checks include Docs anchors and return,
preserved write review, market-change reset, buyer/writer permissions, inline
portfolio focus, empty markets and RPC recovery. Root, Docs and call/put metadata,
browser history and the local production preview of chain 46630 were checked;
an absent factory leaves signing disabled on desktop and mobile.

Limitations: the catalog is source configuration, not an administrative UI. Logos
currently share the generic stock fallback. Balances are token accounting, not a
market valuation; Activity remains browser-local. These are automated agent checks,
not an audit or human usability validation. Contracts, SDK interfaces, ABIs and
deployment manifests are unchanged. The Sites workflow preserved the existing
hosting setup and social asset; this iteration remains local and was not republished.

## Named demo markets, exact totals and local resale V2 — September 9, 2026

This section supersedes the earlier UI descriptions of per-token premium inputs,
sticky review cards, and deferred resale. Earlier evidence and limitations above
are preserved as the record of those iterations, not claims about this version.

Implemented the human-approved local V2 scope: `Option` retains its five lifecycle
states and immutable writer/terms/collateral, while `buyer` is the current holder.
Listing, updating, removing and atomically buying a whole right are supported.
Seller/price/nonce guards reject stale reviewed offers. Resale proceeds go only to
the selling holder, not the writer. Exercise remains possible while listed.
Exercise, resale and reclaim invalidate the listing; exact-transfer failures roll
back ownership, listing, nonce and balances. Self-purchases and writer buybacks
are forbidden. No fees, partial lots, free transfers, NFTs, oracle, AMM, automatic
settlement or public-chain contract deployment were introduced.

Factory `version()` authenticates new V2 deployments. Manifests, generated ABIs
and the shared SDK now distinguish V1/V2; omitted versions remain V1. Legacy
contracts are not upgraded. The SDK authenticates option registry membership for
resale preparation, retains the reviewed resale quote through approvals, and
reads mutable holder/state/listing information at the snapshot block. Immutable
terms are cached with reorg checks and local HTTP reads are batched. V2 Bought
and Resold events preserve past-holder history and actual payments. Event reads
still scan the market history: this is a PoC, not a production indexer.

The frontend uses shadcn base-nova source components with pinned Base UI 1.8.0,
class-variance-authority 0.7.1, clsx 2.1.1 and tailwind-merge 3.6.0. Source components
come from the official shadcn registry; icons use the existing self-hosted font
system. Button, tabs, input, dropdown, alert, table, collapsible, scroll area and
drawer primitives share the existing graphite/green tokens. Optional platform
packages in the lockfile were preserved. Sites guidance preserved vinext, hosting
configuration and the existing social asset; no website publication was performed.

Trade now uses a controlled nonmodal bottom drawer without a backdrop, outside-click
dismissal or page-scroll lock. Selection updates the same mounted panel; explicit
close, Escape, a height control and internal scrolling remain available. Portfolio
details remain inline. Buy/Write is an aligned accessible tab control. Active market
identity includes the full name, symbol and ID; switching clears review/amounts and
resets custom expiration mode. Writing takes independent quantity, total exercise
payment and total option price. Call Max changes quantity; put Use available
collateral changes only exercise payment. Unit premium/average columns are removed.

Strike is only a grouping reference. Each expiry/strike expands to independent
whole quantities ordered by quantity then total asking price, with new/resale
source labels and current-seller ownership tint. Dates remain horizontally scrollable
and the strike count defaults to 10. Docs has sticky navigation, offset anchors,
a call/put delivery comparison, resale mechanics and context-preserving return.
The mobile chain grid minimum-width bug found during screenshot review was fixed.

`demo:local` deploys Mock Tesla, Mock NVIDIA, Mock Apple, Mock Amazon and Mock
Microsoft plus five V2 factories using unlocked Anvil accounts 1–9, never 0. It
reuses valid MockUSD or bootstraps one from account 1. Existing local primary and
practice deployments remain legacy Portfolio assets. The main 8545 node was not
reset or time-warped. It now has exactly 390 seeded V2 contracts: 360 primary offers,
10 held rights, 10 resale listings and 10 canceled options (370 available offers).
Reference prices, synthetic premium formula, dates and reproduction commands are
in `docs/local-demo-v2.md` and `scripts/demo-config.mjs`.

The ignored per-transaction ledger records intents before broadcast and recovers
known nonces/receipts on interruption. Dry-run performs no writes; deploy/seed
stages are separately selectable. Completed human-altered fixtures are skipped.
Two concurrent seed processes are not supported. A ledger from another node is
rejected; do not discard the ledger to reseed an existing chain.

Validation performed locally:

- `npm test`: 90 passing executions (53 Solidity, including inherited lifecycle
  regressions; 7 script tests; 11 SDK tests; 19 frontend tests). Coverage includes
  call/put conservation, repeated resale, old-holder rejection, stale/canceled
  listings, exact expiry, failed approvals, transfer-fee rollback and reentrancy.
- Typecheck and ESLint passed. ABI regeneration and both chain-31337 and default
  chain-46630 production builds passed. The existing large-bundle warning remains.
- `test:e2e` on isolated Anvil 8546: nine lifecycle scenarios/460 checks, plus V2
  call/put resale transactions, stale-quote rollback, current-holder permissions,
  history and exercise conservation. Evidence is in ignored local smoke manifests.
- Browser acceptance used accounts 1, 8 and 9 on isolated 8546, never the user's
  8545 node. Call and put creation/purchase/resale/exercise, rejected signatures,
  cancellation, expired reclaim and pending receipt reconciliation passed. An
  additional write-and-cancel check confirmed all five actual target factories.
- `demo-resume-check.mjs` recovered an interrupted-broadcast ledger and reran it:
  the same 390 addresses and no additional blocks/transactions. Fresh deployment
  bootstrapping and rerunning the deploy stage passed on isolated Anvil 8547.
- Read-only UI checks passed at 1440, 768 and 390px: five market contexts,
  independent totals, fractional lots, same-node nonmodal drawer selection, Docs
  anchors/return, pinned navigation and no page-level horizontal overflow.
  A connected chain-46630 preview also produced zero signing requests and kept
  creation disabled with no configured factory. Unsold canceled/expired options
  explicitly show no payment instead of inventing premium income.
- Read-only account-zero snapshots before and after the live seed were identical:
  nonce 23, native ETH and all three existing token balances unchanged. Evidence:
  `deployments/local-demo-account0-check.json`. Seed senders are accounts 1–9 only.

Environment limitation: the system partition filled during additional Chrome/build
runs. Task-specific temporary directories on the repository disk allowed validation
to continue without deleting user files or stopping their services. Failed attempts
were rerun after correcting the environment and the UI issues they exposed.

The root README now contains a copyable three-terminal local runbook. It separates
one-time dependency installation, contract/ABI/SDK compilation, Anvil lifetime,
the write-free seed plan, the 390-option V2 deployment/seed, and frontend startup.
Each fresh Anvil session uses unique ignored manifest and ledger paths; interrupted
runs reuse the same paths to resume. The runbook also distinguishes `demo:local`
from the account-zero legacy `deploy:local`/`seed:local` workflow. This was a
documentation-only clarification: no contracts were deployed and no services were
started while verifying it.

These are automated agent checks, not an audit or human approval. Prices and faucet
balances are synthetic. The V2 resale scope is local only; the hosted Robinhood
testnet manifest still has no factory and remains incapable of funded trading.


## Whole-fill buy requests and documentation reset — September 13, 2026

The human coordinator selected the bounded hackathon scope: writer-first options plus
premium-funded buy requests, full acceptance only, quantities in multiples of 0.1 raw
token and one independent option per agreement. No partial fill or matching engine was
added. The coordinating agent implemented contracts, SDK, UI, tooling and documentation;
no additional agent review or human approval is claimed.

Factory V3 escrows request premiums by ID and tracks their aggregate reserved balance.
Acceptance creates and funds one option, assigns the requester as buyer and pays the
premium to the writer atomically. Only the requester can cancel an unaccepted request,
including after its acceptance deadline. The option has a later exercise expiration.
New writes enforce the 0.1-token increment using underlying decimals; existing V1/V2
contracts retain their original terms. V2 whole-option resale is retained in V3.

The standalone SDK adds request reads, preparation and structured errors. Registry reads
include requests at the same snapshot block. Portfolio separates available funds, writer
collateral, active request premiums and expired refundable premiums, deduplicating shared
tokens and repeated request records. The web adds Buy Requests, exact funding review,
requester/writer actions, created-option links and request entries in Portfolio. Wallet
changes invalidate request review without erasing typed terms. Operation notifications
remain visible inside the active review panel.

README, the current roadmap, local walkthrough, SDK guide and in-app docs now distinguish
implemented source, local execution, RPC-fork simulations and public deployment. Historical
research and earlier execution records remain preserved. Targeting Robinhood testnet is
not described as a completed launch. Deployment scripts emit V3 manifests; existing live
factories are never upgraded or silently overwritten.

Executed validation for this change:

- `npm test`: 80 Foundry test cases, 7 script tests, 15 SDK tests and 19 frontend tests
  passed. Foundry counts include inherited lifecycle cases. The optional Robinhood TSLA
  RPC-fork test ran locally with synthetic balances; it sent no public transaction.
- Request tests cover call/put exercise conservation, independent reservations, cancellation,
  deadline equality, caller permissions, competing acceptance, failed collateral and premium
  rollback, failed refunds, hostile token callbacks and minimum lot validation.
- Typecheck, frontend lint and production build passed; generated ABIs match V3 source.
- `npm run test:e2e` passed on a new isolated Anvil at port 8547: nine existing lifecycle
  scenarios/460 checks, two resale scenarios and request reservation/acceptance/exercise,
  cancellation, expired refund and expired accepted-option recovery. An actual competing
  acceptance receipt reverted without changing the completed request.
- The standalone SDK lifecycle example passed against that isolated V3 deployment.
- `scripts/browser-requests.mjs` passed call and put request creation, 0.15-token rejection,
  premium portfolio visibility, writer acceptance, created-option navigation and requester
  cancellation using two injected local wallets. The writer viewport was 390px; the created
  option view had no horizontal overflow. No real browser wallet extension was automated.

The browser check used an ignored copy of the web project and isolated RPC configuration.
The coordinator's original local node and checked-in browser deployment manifest were not
reset or replaced. Local receipts are in ignored `deployments/local-requests-smoke.json`;
these are local transaction evidence, not public deployment evidence.

Remaining limitations: full acceptance needs one writer for the entire request; registry
refresh is linear; refunds/exercise require transactions. Request premiums share factory
escrow with per-request accounting, while each accepted option has isolated collateral.
Exact-transfer, non-rebasing token compatibility remains required. There is no public
Robinhood deployment, independent security audit, human usability study or proven liquidity.

The existing owner-private frontend was subsequently updated through Sites. Publication
reported `succeeded` at 2026-09-14 01:43 UTC (September 13 in the coordinator's timezone),
using source snapshot `1c9ead879e0ba2e487d58948d2a0682f50eff145` in a separate hosting
checkout. The working repository was not committed by this publication. The website
remains configured for chain 46630 without a factory or payment-token address, so no
protocol transactions are enabled there. This is frontend publication only, not a
Robinhood contract deployment. The temporary verification node and preview were stopped
after the checks; their saved local manifests are historical evidence, not live services.
