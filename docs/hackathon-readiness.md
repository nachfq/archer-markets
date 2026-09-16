# Open House Singapore submission path

Prepared September 16, 2026. This is a proposed execution sequence, not evidence of
public deployment, human approval, demand, or a competition result.

## Positioning

**Stock Options Lab lets a buyer request a fully collateralized Stock Token option
by reserving its premium; one writer accepts the complete agreement, and the buyer
can manually exercise for physical token delivery.** The first audience to validate
is a Stock Token holder who wants to define protection terms and a counterparty
willing to fund the entire obligation. Demand and willingness to provide collateral
remain hypotheses.

The current protocol is Solidity. The event explicitly accepts Solidity or Stylus
and existing projects. Its published criteria cover contract quality, product-market
fit, innovation, and solving a real problem. Deployment on an Arbitrum chain is required;
Robinhood Chain is explicitly listed. A local demo and the existing unconfigured
hosted frontend do not establish that requirement.
[Official event listing](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon).

The listing currently gives registration through October 2, 2026 and submission
through October 4, 2026. Verify the exact cutoff and timezone in the signed-in
submission portal; this review does not establish the timezone or private form fields.
Review the event's current terms and required deliverables before submitting.

## Prioritized next steps

1. **Close the local acceptance gate.** Keep the security review, automated tests,
   failure reproductions and exact revision together. Resolve any open custody,
   permission or amount defect before recording a demo.
2. **Perform a public testnet acceptance run.** Use fresh disposable wallets,
   obtain gas and the selected test Stock Token, confirm transfer compatibility,
   deploy V3, and verify addresses, version, token decimals and receipts. Exercise
   a call and a put using two real wallets. Add request acceptance and cancellation.
   Publish a matching frontend only after these checks. MockUSD must remain labeled
   as freely minted, valueless test funds. Saved local addresses are not reusable
   evidence for chain 46630.
3. **Validate the problem with people.** Interview at least three prospective
   buyers/writers and run two independent walkthroughs. Ask them to distinguish
   premium, collateral, exercise payment and both deadlines, then complete a request
   and refund without coaching. Record failures, quotes with consent, and resulting
   changes. Do not call interviews adoption or treat a synthetic order book as demand.
4. **Package the submission.** Prepare an English README, a short video, public
   contract/explorer links, architecture diagram, reproduction commands and a concise
   limitations/security section. Confirm the portal's actual upload and video limits.
   Explain why full collateral and one contract per agreement make the initial
   custody model understandable, and acknowledge the liquidity/capital tradeoff.

## Three-minute demonstration script

- **0:00–0:30:** State the user hypothesis and identify test tokens/network. Explain
  total premium, total exercise payment, manual exercise and physical delivery.
- **0:30–1:15:** Buyer requests a put for a multiple of 0.1 token; show the premium
  leaving the wallet and becoming reserved in the factory.
- **1:15–2:00:** Writer accepts the entire request; show the new option address,
  full collateral, buyer assignment and premium paid to the writer.
- **2:00–2:40:** Buyer approves token delivery and exercises. Reconcile both wallets
  and the emptied option against the agreed amounts.
- **2:40–3:00:** Cancel a second unaccepted request and show the exact refund.
  State public deployment status and remaining limitations accurately.

Use a small fixture, not the optional 390-offer synthetic market. Include a recorded
fallback if the public RPC/faucet fails; label the network of every recording.

## Stylus decision

Keep Solidity for this submission. The current lifecycle mostly transfers tokens
and updates storage. Stylus interoperates with Solidity and primarily benefits
compute- or memory-heavy work; storage-heavy code does not automatically become
cheaper. [Official Stylus overview](https://docs.arbitrum.io/stylus/gentle-introduction).

If user research establishes a need for an onchain computational module, propose a
separate experiment with identical inputs/outputs and differential tests. Measure
activation, first/repeated execution, ERC-20 calls and storage on a Stylus-enabled
Nitro node. Ordinary Anvil tests do not execute WASM. A browser-only calculator does
not justify claiming Stylus integration. Do not add pricing, oracle settlement,
matching, partial fills, margin or mainnet under the security-review task.
