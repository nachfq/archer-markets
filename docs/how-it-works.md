# How Archer Markets works

An option gives its holder a right to exchange an agreed quantity of Stock Tokens
for a fixed payment before a deadline. The writer deposits all required collateral
upfront. Each agreement creates one independent option, accepted and exercised in full.
Quantities are multiples of **0.1 token**.

## Who does what?

**Maker** publishes terms; **taker** accepts them. These roles depend on the flow:

| Flow | Maker | Taker | Funds deposited when published |
| --- | --- | --- | --- |
| Sell · Post an ask | Writer (seller) | Buyer | Writer's full collateral |
| Buy · Post a bid | Buyer (requester) | Writer | Buyer's full premium |

A request becomes an option only when a writer accepts and deposits all collateral.
At acceptance, the buyer receives the right and the writer receives the premium.
There are no partial fills or automatic matching. A bid above an ask leaves both
orders open until someone explicitly accepts one. Accepting a bid creates a new option;
it does not sell an already-written ask or reuse its collateral.

## What moves?

| Option | Writer locks | Holder delivers at exercise | Holder receives |
| --- | --- | --- | --- |
| Call | Stock Token quantity | Total exercise payment | Stock Token quantity |
| Put | Total exercise payment | Stock Token quantity | Total exercise payment |

Example: **0.2 tokens**, **60 MockUSD exercise payment**, **2 MockUSD premium**.
The buyer pays 2 for the right. Exercising a call later costs another 60 and delivers
0.2 tokens. Exercising a put delivers 0.2 tokens and receives 60. The displayed strike
is 300 per token (60 ÷ 0.2); **60 is the total exercise payment**.

An approval permits spending; the following transaction moves the funds. Exercise
exchanges both assets in one transaction. There is no market-price oracle or automatic payout.

## How does it end?

- **Exercise:** the current holder acts any time before expiration. The transaction
  must execute before the onchain deadline. Keep the required tokens and gas available.
- **Resale:** the holder can sell the whole right. Collateral and exercise terms stay
  unchanged; the resale payment goes to that holder.
- **Cancellation:** the writer can cancel an unsold offer; a requester can cancel an
  unaccepted request and recover its premium. A sold option cannot be canceled.
- **Expiration:** the right ends. The writer manually reclaims unused collateral and
  keeps the paid premium. An expired, unaccepted request requires manual premium recovery.

## Where to look

**Trade** shows Calls / Strike / Puts, with Bid and Ask prices per token. Click an Ask
to buy or a Bid to sell a new option; Buy / Sell posts your own price. Expand a strike
for all orders and their full quantities. All four entry points use the same ticket:
quantity, expiration, strike and premium per token. Totals are calculated automatically.
Editing a selected quote posts a new order instead of accepting the original. **Portfolio** shows wallet balances,
locked collateral, reserved premiums and positions; expand a position for its actions
and contract details. **Activity** shows transactions submitted in that browser.
Balances are token amounts, not a portfolio valuation. Stock Tokens are not direct shares.

[Run the two-wallet walkthrough →](demo.md)
