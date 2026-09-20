# How Archer Markets works

**One order trades one option covering one Stock Token.** Each option has its own
contract and collateral. A book contains one stock/payment pair, call or put, strike
and expiration. Prices use 0.01 increments in the payment token.

## Buy and sell

Click an **ask to buy** or a **bid to sell**. The same ticket opens with that price.
You can also choose Buy/Sell and enter a limit. Quantity is always 1.

- **Buy:** pays the lowest eligible ask, or reserves the limit premium as an open bid.
- **Sell new option:** deposits one stock token for a call, or the full strike payment
  for a put. It receives the highest eligible bid, or rests as an ask.
- **Matching:** the contract executes at the resting order's price. Equal prices use
  oldest-first priority. One transaction fills at most one order; no partial fills.

The displayed bid is the highest buy price; the ask is the lowest sell price. Counts
combine all orders at that price. Click a strike to see other levels. If your order
would trade with yourself or return an option to its writer, it reverts instead of
skipping another order. No centralized service chooses or executes matches.

## Hold, resell, exercise

Buying gives you the exercise right; it does not deliver stock yet. From **Portfolio**,
choose **Sell owned option** to put that right into the same book. Its writer and
collateral remain unchanged; the resale premium goes to the previous holder.

| Option | Holder delivers at exercise | Holder receives |
| --- | --- | --- |
| Call | Strike payment | 1 stock token |
| Put | 1 stock token | Strike payment |

Exercise is manual, any time **before expiration**, and requires funds, allowance and
gas. A call at strike 300 with premium 10 costs 310 in total if exercised. Premiums
already paid are not refundable.

## Cancel or expire

Open bids can be canceled for a full premium refund. Unsold new asks return collateral;
canceling a resale only removes its listing. Orders stop matching at option expiration.
Afterwards buyers recover unspent bid premiums and writers reclaim unused collateral
with a transaction. Nothing automatically exercises or withdraws funds.

**Portfolio** shows balances, collateral, bids and positions. **Activity** shows this
browser's submissions. Older V1–V3 positions keep their original rules and management.

[Local maker/taker walkthrough](demo.md)
