# Expiration and settlement

## Current product: manual American exercise with token delivery

The current contract has one immutable expiration timestamp. The buyer may exercise
while `block.timestamp < expiry`; at or after that timestamp, exercise reverts.
The writer may then reclaim collateral. Leaving collateral in the contract does
not extend the buyer's right. The premium remains with the writer. Both exercise
and collateral recovery require transactions; neither happens on its own.

The payment and lot are fixed when the option is created. A call exchanges the
agreed quote amount for the agreed underlying tokens; a put reverses that exchange.
The contract does not decide whether an option is profitable and does not read a
closing price. Consequently, there is no external settlement-price submission or
price dispute in this implementation. The buyer decides whether to exercise.

For example, a call on 100 tokens with a total exercise payment of 30,000 MockUSD
always exchanges those exact amounts if exercised. A market price of 350 per token
does not cause the contract to pay 5,000 MockUSD automatically. These are fictional
terms, not a market quote or a statement that 100 tokens represent 100 shares.

## Suggested dates and user experience

The interface offers the next four Fridays and the next three third-Friday monthly
dates, deduplicated and sorted. Presets use 16:00 America/New_York with daylight saving
adjustments. These are protocol suggestions inspired by equity options, not official
exchange series: no holiday or early-close calendar is implemented. A custom local
date/time remains available, and the exact UTC deadline is displayed before creation.
The 100-token shortcut changes quantity only; premium and exercise payment remain
totals for the entire lot and must be set by the writer.

The traditional reference is the usual third-Friday monthly expiration and manual
American exercise before expiry. Traditional exercise-by-exception processing is
not implemented here. [OIC exercise reference](https://www.optionseducation.org/referencelibrary/faq/options-exercise).

Before purchase, a buyer must acknowledge the manual deadline and the absence of an
automatic payout or premium refund. This is a user-interface safeguard, not a contract
permission or a replacement for contract enforcement. The detail page shows UTC and
local time, an estimated countdown, a prominent warning, and an expired-right message.
An expired option can remain in the stored Active state until the writer reclaims;
the interface derives its expired status from the deadline as well as the stored state.

## What is guaranteed, and what is not

The deployed bytecode fixes the deadline, lot, and payment and enforces the caller's
rights atomically. There is no application admin setter or discretionary settlement
server. A wallet approval or pending transaction is not successful exercise: execution
must occur in a block whose timestamp is strictly before expiry.

Blockchain time is not an independent guarantee of an exact exchange closing instant.
Arbitrum timestamps depend on the sequencer and protocol bounds. Network availability,
transaction ordering, RPC access, token transfer restrictions, and user funds remain
operational dependencies. Robinhood-specific timestamp bounds and outage guarantees
have not been verified here; the general Arbitrum values must not be treated as a
Robinhood configuration audit. [Arbitrum time reference](https://docs.arbitrum.io/arbitrum-essentials/arbitrum-vs-ethereum/block-numbers-and-time).

No warning can guarantee execution, prevent forgetting, or recover an expired right.
Calendar reminders can help but do not execute transactions. A keeper added to the
current contract cannot simply exercise for the buyer: `exercise()` requires the
buyer as caller. Delegated exercise would require a deliberate authorization design,
fixed recipients, restricted permissions, and funding/allowance handling.

## Separate future design: settlement after expiration

If the desired product settles based on a price at time T, it needs a different
contract version. Define a price observation time T and a subsequent settlement or
claim window, rather than extending the existing manual option after its deadline.
The reference value must remain tied to T; allowing a claimant to choose a later
price changes the economic right.

A possible design would let anyone submit eligible oracle evidence and trigger
settlement, with the contract verifying the feed, observation policy, and recipients.
An executor would relay evidence, not choose the price or direct the funds. It would
still require an available oracle and someone to submit a transaction. Before building:

- Define the asset being priced: the specific Stock Token or a reference equity,
  including units and corporate-action handling. Do not assume price equivalence.
- Verify a suitable feed on the target network, its provenance and decentralization,
  market hours, timestamps, update cadence, and stale-data behavior. No such feed has
  been selected or verified for this project.
- Fix the observation rule before purchase: official close, a specified historical
  observation, or a bounded averaging window. A generic latest price is not proof of
  the closing price at T.
- Specify market holidays, halts, sequencer outages, missing observations, correction
  policy, finality, and any challenge period. Failure behavior must not give an
  operator a discretionary price override or allow premature collateral recovery.
- Design collateral and settlement economics for that payoff. Today's physical
  delivery collateral does not automatically fund a cash-settled payoff in another
  token. Execution incentives and claim funding also need explicit treatment.

This is an architectural direction, not an implemented oracle integration or a
promise of fully autonomous settlement. Keep the manual PoC clearly labeled until
the product decision and its contract invariants change together.
