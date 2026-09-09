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
