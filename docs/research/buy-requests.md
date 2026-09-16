# V3: whole-fill buy requests

## Product scope and status

Implemented source and local validation, not a Robinhood testnet deployment. A buyer can
reserve a premium and ask a writer to create a specific call or put. Requests must be
accepted completely. No matching engine or partial execution is included.

One lot is exactly 0.1 raw underlying token, enforced by the factory using the token's
ERC-20 decimals. The underlying must have 1–77 decimals. Ten tokens represent 100 lots,
but accepting that request creates one option contract. V1/V2 positions keep their
original terms, including historical quantities outside this increment.

## Contract interface

`OptionFactory.version()` returns 3. Existing option creation and resale remain supported.
The factory exposes `lotSize`, `requestCount`, `getRequest(id)` and `reservedPremium`.

- `createRequest(kind, quantity, strikeTotal, premium, expiry, acceptUntil)` records
  immutable terms and transfers the exact premium from the requester to the factory.
- `acceptRequest(id)` requires an open request, a different writer and execution strictly
  before `acceptUntil`. It creates one option, deposits the writer's entire collateral,
  assigns the requester as buyer and transfers the reserved premium to the writer.
- `cancelRequest(id)` is requester-only and returns the entire premium of an open request,
  before or after its acceptance deadline. It cannot cancel an accepted option.

`now < acceptUntil < expiry` is required at creation. A request can be Open, Accepted or
Cancelled. An Open request past `acceptUntil` is displayed as premium recoverable; the
state changes only when a refund transaction succeeds. Accepted requests retain their
resulting option address. IDs are scoped to the factory and chain, never global.

The factory escrows only unaccepted request premiums. Active option collateral resides
in each separate option contract. The factory tracks reserved premiums explicitly;
unsolicited donations are not withdrawable balances. No administrator can redirect funds.
Supported tokens must be non-rebasing and transfer exact amounts without fees.

Acceptance changes request state before external interactions and is non-reentrant.
Creation, both transfers and buyer assignment are atomic. Failure at any step rolls back
all state and transfers. The option's `activateRequestedPurchase` entry point is
factory-only; the actual factory calls it solely for the new option created by acceptance.
It emits the same purchase event used by portfolio payment history.

## Frontend and SDK

Trade exposes Buy Options, Write Options and Buy Requests. Buy Requests offers a creation
form, explicit acceptance deadline, review, open/mine filters, writer funding review and
request cancellation. Accepted requests link to their independent options. The original
buy/exercise/resale/expiry flows continue to operate on the option itself.

Portfolio reads requests and positions from configured factories. `requestPremium` is
an unaccepted premium whose acceptance deadline is future; `refundablePremium` is one
whose deadline passed. Both belong to the requester and count in `totalTracked`, once
per request. They are never writer collateral or duplicated as purchased-right value.
Active requests are also cancelable; the separate refund column highlights expired ones.

SDK exports: `validateLotQuantity`, `getBuyRequest`, `prepareCreateRequest`,
`prepareAcceptRequest`, `prepareCancelRequest`. `getMarkets` includes request records
at the same block as positions; `getPortfolio` includes the connected requester's requests.
The factory is the approval spender for premium reservation and writer collateral.
Legacy markets refuse request preparation before signing.

## Validation and remaining work

Tests must cover both option types, independent request reservations, complete fills,
competing acceptance, caller permissions, acceptance and exercise boundaries, cancellation,
exact-transfer failures, callback reentrancy, registry rollback, and portfolio conservation.
The SDK/Anvil integration is `scripts/smoke-requests.mjs`, included in `npm run test:e2e`.
See the dated implementation record for executed checks and their environment.

Requests are read linearly from the registry. There is no indexer, automatic refund,
automatic matching, partial acceptance, fee or request editing. Cancel and create again
to change terms. A large request may wait longer because one writer must cover it all.
Human usability validation, independent security review and public testnet deployment
remain outstanding.
