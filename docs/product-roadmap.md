# Product roadmap

## Current human decision

Build a comprehensible factory for fully collateralized, physically delivered American
options. Users can write an option for sale or request an option by reserving its premium.
Quantity is a multiple of 0.1 token, with complete acceptance and one contract per agreement.
Retain existing whole-option resale. Keep chain-specific configuration outside product logic.

## Delivery stages

| Stage | Outcome | Status |
| --- | --- | --- |
| Repository implementation | Factory, versioned SDK, options UI, request reservation/acceptance/refund | Implemented in source; see local checks in implementation.md |
| Human local walkthrough | Two users understand premium, collateral, request and exercise without guidance | Pending human validation |
| Robinhood testnet launch | Funded wallets, V3 contracts, receipts and matching frontend configuration | Not deployed; public acceptance pending |
| Hackathon demonstration | Request a put, accept it as writer, exercise and reconcile balances | Local workflow available; public demo pending |
| Portability | Validate another EVM testnet and compatible RWA pair | Future work |

Implementation, local tests, synthetic fixtures, RPC-fork simulations and public deployments
must be reported separately. A hosted frontend and saved manifests do not establish a
funded deployment or human acceptance.

## Acceptance criteria

- Write option: review and deposit the whole collateral; premium arrives only when bought.
- Request option: review and reserve the premium; no exercise right exists yet.
- Accept request: one writer covers the complete quantity; one funded option and premium
  payment result atomically. Requester becomes holder without a second purchase.
- Cancel request: only its requester recovers an unaccepted premium; accepted options
  remain unaffected. Expired requests show a manual refund action.
- Portfolio distinguishes available funds, option collateral, reserved request premiums
  and expired recoverable amounts. No double counting across markets sharing a token.
- Each option preserves its writer, buyer/holder, quantity, premium, exercise amount,
  deadline and isolated collateral. Manual exercise exchanges the full amounts.
- Missing/invalid deployment, wallet changes, RPC failures and stale states prevent
  unsafe submission. Approval, pending operation, receipt and failure are distinct.
- Docs, SDK and demo commands describe the implemented version and actual deployment status.

## Deliberately deferred

No matching engine, automatic crossing, partial fills, partial exercise, margin, AMM,
oracle settlement, mainnet or automatic execution. Lotted quantities alone do not
promise liquidity. These additions require separate product decisions and contract work.

## Architecture

V3 factories introduce requests and minimum lot validation; existing V1/V2 deployments
are not upgraded. Generated ABIs and deployment manifests form the integration boundary.
The standalone SDK prepares transactions without custody, React or embedded keys.

See [buy requests](buy-requests.md), [demo](demo.md), [SDK](../packages/sdk/README.md) and
[implementation record](implementation.md). Preserve historical research as hypotheses
and source material, not proof of product adoption.
