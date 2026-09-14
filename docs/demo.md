# Local V3 walkthrough

This guide describes a local demonstration to run, not an already-running testnet product.
Robinhood Chain Testnet has no configured protocol deployment. Use the root README to
start Anvil, deploy fresh V3 factories, seed and start `npm run dev:local`.

## Two wallets

Use two disposable local Anvil wallets: requester and writer. Connect them in separate
browser profiles to the same local chain 31337. Obtain MockUSD and MockSTOCK from the
wallet menu. These tokens are fixtures with no real value. Never use public Anvil keys
on a public network. Approval alone does not deposit funds.

## Request a put and exercise it

1. As requester, select the practice market and **Buy Requests → Request option**.
2. Enter Put, quantity **0.2 token**, total exercise payment **60 MockUSD**, total premium
   **2 MockUSD**, and a future exercise expiration. Set **Accept until** earlier than the
   option expiration and later than the current chain time.
3. Review the complete quantity, deadlines and premium deposit. Reserve the premium.
   Portfolio should show 2 MockUSD in request premiums and 2 fewer MockUSD available.
   There is no option yet and no Stock Tokens are deposited by the requester.
4. As writer, open that request and review acceptance. The writer needs **60 MockUSD**
   upfront for collateral. Approve the factory if necessary and select **Accept & write
   option**. The 2 MockUSD premium cannot fund the upfront collateral deposit.
5. Acceptance creates one option holding 60 MockUSD, assigns the requester as buyer and
   pays 2 MockUSD to the writer. The request links to that option. Both wallets can find
   the position in Portfolio; the requester no longer has a reserved premium.
6. As requester, review exercise before expiration. Approve **0.2 Stock Tokens** to the
   option and exercise. The tokens go to the writer and the requester receives 60 MockUSD
   from the option in the same transaction. Missing funds/approvals revert the exchange.

For a call with the same terms, acceptance deposits 0.2 Stock Tokens instead. Exercise
requires the holder to deliver 60 MockUSD and receives those 0.2 tokens. The 2 MockUSD
premium is paid separately, never deducted from exercise payment.

## Request cancellation and expiration

Publish another request and cancel it before acceptance. The requester recovers the full
premium. Repeat with a short acceptance deadline; after it passes, acceptance is disabled
and **My requests** offers premium recovery. No refund happens automatically. After a
request is accepted, request cancellation is unavailable; manage the resulting option.

If a purchased option expires unexercised, the writer can reclaim its collateral. The
buyer cannot exercise at or after the onchain deadline; already-paid premium stays paid.

## Writer-first flow and resale

**Write Options** still creates an unsold collateralized option. Quantity is a multiple
of 0.1, accepted in full. A buyer pays the premium to the writer. Unsold options can be
canceled by the writer. V2/V3 holders can list the complete right for resale; its writer,
collateral and exercise terms remain unchanged.

## Evidence and checks

The onchain request/option registries populate Portfolio. Activity is browser-local
submission history reconciled with onchain receipts. Clearing browser storage does not
delete contract positions or requests.

Run `npm test`, `npm run typecheck`, `npm --prefix web run lint` and `npm run build` for
source checks. Follow the root README's isolated Anvil instructions for `npm run test:e2e`.
Those checks advance time, so never use the active manual-demo node. Historical browser
review scripts are development fixtures, not public testnet acceptance evidence.
