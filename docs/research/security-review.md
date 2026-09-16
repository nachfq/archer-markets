# MVP security and end-to-end review

Date: September 16, 2026. Baseline: `b5f944f3012159f2e3fc0d6470ab75f3da422399`.
Scope: the working-tree corrections accompanying this report, V3 options and
requests, retained V2 resale, SDK, frontend, deployment tooling and dependencies.
Reviewer: coordinating agent, with automated tests. This is not an independent
professional audit, formal verification, human approval or a security guarantee.

## Acceptance decision

**Pass for a controlled local MVP demo.** The complete acceptance run passed after
corrections. No unresolved critical/high application finding or medium finding
affecting custody, authorization or agreed amounts was identified within this scope.
This conclusion does not extend to unrestricted public use; see the limits below.
Robinhood public deployment, real wallet-extension acceptance and hosted publication
remain separate requirements. No public transaction is authorized or claimed by
this review. The checked-in chain-46630 manifest still has no factory/payment token.

## Findings and corrections

| ID | Severity / category | Observation | Correction and regression |
| --- | --- | --- | --- |
| DEP-01 | High upstream advisories; reachability varies | The web dependency audit reported 20 affected packages (16 high, 2 moderate, 2 low), including React Server Components denial of service. These are dependency findings, not 20 demonstrated application exploits. | Pin patched React/React DOM/RSC 19.2.8, Vite 8.0.16, vinext beta.10, RSC plugin 0.5.35, Cloudflare plugin 1.54.10 and Wrangler 4.132.0; refresh compatible transitive lockfile entries. Validate install, build and browsers; rerun both audits. |
| WEB-01 | Medium availability | Concurrent option-page metadata requests used the shared HTTP-batched viem client. A local Worker canceled a request as hung; its stack showed viem's batch scheduler resolving another request's promise, and the browser reported `Connection closed.` | Create a separate, unbatched, uncached metadata RPC client per request. Add concurrent metadata reads with canceled requests and require successful option titles, plus zero browser runtime errors in the full flow. No token movement or custody failure was observed. |
| UI-01 | Low review integrity | Switching accounts hid a request review, but switching back resurrected it. The regression failed when attempting the required fresh review. | Clear request review on account or chain changes while preserving typed terms; exercise account/network changes, fresh review and signature rejection in browser acceptance. |
| QA-01 | Validation gap | CI used port 8545, which browser smoke rejects, deployed markets inconsistent with the five-market browser fixture, and omitted request browser tests. A hardcoded strike also no longer matched the test quantity. The SDK example forced V1 for a V3 manifest. | Add `test:acceptance`, which owns a temporary node, fixture, frontend copy and evidence directory. Run protocol, SDK and both browser suites; use the manifest version and corrected expected strike. CI calls this runner and uploads local evidence. |

React's upstream advisory describes server-function resource exhaustion and fixes
in 19.2.8. No exploit was sent to the hosted site.
[React advisory](https://github.com/advisories/GHSA-wx67-qw84-cm4g).
The metadata fix follows Workers' request-context isolation requirements.
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

## Reviewed trust boundaries and properties

- Supported assets are honest, exact-transfer, non-rebasing ERC-20 implementations.
  Token upgrades, freezes, blacklist policies or changed transfer behavior can
  prevent exercise/refunds; balance-delta checks cannot make a malicious token safe.
- Contracts use checks/effects/interactions with reentrancy guards. Writer collateral
  remains isolated per option; open request premiums share factory custody with
  per-request accounting. Acceptance, funding, holder assignment and premium payout
  are atomic. Requests cannot be partly accepted or refunded after acceptance.
- Boundary tests cover expiration equality, permissions, insufficient approvals,
  fee-on-transfer failures, callbacks, repeated operations, stale resale quotes,
  competing acceptance and rollback. Donations cannot block predictable option
  creation; unsolicited surplus has no rescue path and must not be sent deliberately.
- The added stateful invariant executes randomized create/accept/cancel/settle/time/
  donation operations among three funded actors. After each step it verifies the
  aggregate open premiums, donation surplus, accepted-option count, backing of
  active options, emptied terminal options and total stock/payment-token conservation.
  No further minting occurs during those sequences.
- The SDK authenticates factory/token/version/decimals and option registry membership
  before preparing approvals. New tests reject absent bytecode, mismatched metadata
  and unregistered options. UI approval and operation are separate steps, with
  simulation and wallet/network checks before broadcast.
- Tracked-file scanning found no embedded private-key literal or private-key PEM
  matching the checked patterns. Ignored `.env` contents were not printed or copied.
  This is a bounded scan, not proof that every secret format/history is absent.

## Executed evidence

Environment: Linux x86_64, Node 26.8.1, Foundry 1.3.1 (the CI-pinned version),
Solidity 0.8.24, Playwright 1.63.0 / Chromium 1243. Foundry and Chromium were provisioned
in the ignored `.qa-tmp-audit/` directory; no shell configuration was changed.

| Check | Executed result |
| --- | --- |
| `npm test` | 124 passing executions: 81 Foundry, 7 script, 17 SDK and 19 frontend tests. Solidity totals include inherited cases, not 81 unique scenarios. |
| Stateful invariant | 128 runs × 64 steps = 8,192 calls, zero reverts; all conservation/backing checks passed. |
| Robinhood fork | The optional TSLA call/put test passed locally with synthetic balances. No public transaction. |
| `npm run typecheck`, frontend lint, `npm run build` | Passed; ABIs regenerated and identical to checked-in ABIs. Contract source and deployment manifest are unchanged. |
| `npm run test:acceptance` | Passed on its own chain-31337 node, including `test:e2e`, the SDK lifecycle and both browser suites. |
| Protocol E2E | Nine lifecycle scenarios / 460 checks, two resale flows and request acceptance/exercise/cancellation/refund/reclaim, including a reverted competing acceptance receipt. |
| Browser options | Nine scenarios, 39 scenario transactions, exact balance checks, signature rejection, wrong-chain recovery, receipt reconciliation and concurrent metadata reads. Zero browser runtime errors. |
| Browser requests | Four scenarios / 18 transactions: call and put through exercise, cancellation and expired refund. Includes account/network review invalidation, signature rejection, RPC outage/recovery and exact escrow/collateral/balance checks. Zero browser runtime errors. |
| Orca CLI browser | Connected read-only wallet fixture on the unconfigured chain-46630 preview: request creation and collateral submission disabled, zero signing requests; no page overflow at 390 px. Docs/manual-exercise anchor opened successfully. DOM evidence only; Orca screenshot capture timed out. |
| Dependencies | `npm --prefix web ci` passed. Full root and web `npm audit --json` each returned zero advisories. This is a time-bound database result, not an exploit-proof certificate. |

The final isolated acceptance ran from **14:40:12 to 14:42:29 UTC** on September 16,
2026. Evidence is in `.qa-tmp-e2e-6SYnq8/`: `summary.json`, per-stage logs,
`local-smoke.json`, `local-resale-smoke.json`, `local-requests-smoke.json`,
`local-browser-smoke.json`, `local-browser-requests.json`, browser screenshots and
`source-sha256.json` (hashes of the reviewed source/configuration files).
Unit/build/audit logs and Orca snapshots are in `.qa-tmp-audit/`. These files are
ignored local artifacts. Services created for this review were stopped.

The runner restores its own post-deployment snapshot between protocol and browser
stages, so earlier receipts describe executed, subsequently reverted local history.
A saved receipt is not a currently running deployment. Earlier failed runs remain
separate artifacts: they exposed the review-resurrection and metadata failures and
runner startup/hydration issues; they are not counted as passing evidence. Vite's
cold dependency optimization produced transient startup errors/reloads before the
readiness gate; final browser acceptance began only after the server was ready.
GitHub CI was updated but was not executed on GitHub in this session.

Reproduce after installing the pinned dependencies and placing Foundry on `PATH`:

```sh
npm test
npm run typecheck
npm --prefix web run lint
npm run build
npx playwright install chromium
npm run test:acceptance
npm audit
npm --prefix web audit
```

The optional fork can be enabled explicitly with
`RH_RPC_URL=https://rpc.testnet.chain.robinhood.com npm run contracts:test`.
Historical entries in `implementation.md` are not reused as new results.

## Residual limits and release boundary

- No mainnet readiness or real-money safety claim. MockUSD has an unrestricted faucet
  and no monetary value; local stock balances and liquidity are synthetic.
- Full registry/event scans grow with historical activity. Untrusted users can add
  entries to a public market; pagination/indexing and public RPC capacity need work
  before an unrestricted launch. The local MVP does not establish resistance to
  sustained public traffic or registry spam.
- Exercise, request refunds and expired collateral recovery require a transaction.
  A wallet signature or pending transaction does not reserve execution before expiry.
  Missing a deadline can permanently extinguish the exercise right.
- Browser tests use injected local EIP-1193 fixtures, not real extension wallets.
  Real wallets, public stock restrictions, public RPC reliability and human usability
  still require acceptance. No public deployment or hosting update occurred here.
- No static analyzer certification, independent reviewer or formal proof is claimed.
  Passing tests and zero dependency advisories cannot rule out undiscovered flaws.
- Keep the existing full-collateral/manual-exercise/physical-delivery product boundary.
  Follow [the hackathon next steps](hackathon-readiness.md) after the local gate.
