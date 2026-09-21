# How Archer Markets works

Each option covers **one Stock Token**. Buying the option gives its holder a right,
not the token itself. The holder decides whether to exercise before expiration;
there is no automatic exercise.

Each option is a separate smart contract. A call holds the Stock Token its writer
must deliver. A put holds the strike payment its writer must deliver. The holder
provides the other asset when exercising.

| Option | Holder delivers at exercise | Holder receives |
| --- | --- | --- |
| Call | Strike payment | 1 Stock Token |
| Put | 1 Stock Token | Strike payment |

## Trading

Select an ask to buy, a bid to sell, or enter your own limit. Each order is for
one option. Matching happens onchain at the resting price; an unmatched order
remains open until canceled or expiration. An owner can resell an active option
without changing its writer or collateral.

A new seller deposits collateral when posting. A buyer reserves the limit premium
plus the maximum trading fee for an open bid. At execution, the buyer pays the
premium and a fee of **0.01 payment tokens + 0.10% of the premium**. The seller
receives the full premium. Canceling an open bid returns the reserved funds.

## Exercise and expiration

From Portfolio, the holder chooses Exercise and supplies the required token,
approval and gas. The transaction must confirm before the contract deadline.
Premium and trading fee are separate from the exercise payment and are not
refunded.

Unexercised rights expire. Writers reclaim unused collateral and buyers recover
expired bid funds with their own transactions; neither withdrawal is automatic.
Portfolio reads onchain positions. Activity shows submissions from this browser.

[Local maker/taker walkthrough](demo.md)
