# Stablecoins, payments, and asset tokenization

## Scope and evidence standard

The evidence supports exploring both verticals, but not selecting a product yet. Payments offers accessible integrations and mature competition; RWA offers very specific operational requirements, although access to issuers and authorized infrastructure limits a real demo. An invoicing application or a new investment token is not justified simply by belonging to a promoted category.

Research conducted September 9, 2026. Documentation pages reflect what was accessible on that date and may change. The report distinguishes ecosystem statements, technical documentation, operational experience, and product hypotheses. Demand is not estimated from TVL, transfer volume, funding, or commercial testimonials. Build estimates are technical judgments, not commitments or market data.

## Explicit Arbitrum signals

The Founder House Singapore listing includes both **Stablecoins & Payments** and **Tokenization & Real-World Assets**, alongside five other areas. It clarifies that these are examples of projects they want to support and that it is not asking participants to start new projects for Founder House. That guidance belongs to the in-person gathering: it does not establish separate prizes or relative jury preference in the online buildathon. [Arbitrum, Luma listing, 2026 edition](https://luma.com/openhouse-singapore).

For payments, Arbitrum explicitly mentions treasury automation, liquidity routing, lending, and payments as applications of its stablecoin rails. In June 2026, it announced that Mastercard included Arbitrum among the networks in its settlement expansion. These are infrastructure and positioning signals; they do not prove that small businesses need another payment application. [Arbitrum, January 13, 2026](https://blog.arbitrum.io/settlement-layer-stablecoins/); [Arbitrum, June 3, 2026](https://blog.arbitrum.io/mastercard-stablecoin-settlement/).

For RWA, STEP 2 provides a more specific signal: the DAO sought to diversify its treasury and favor liquid, transparent, operationally simple assets. Its RFP discouraged products with redemptions taking weeks or months, insufficient documentation, or maturities requiring continuous decisions. **This is a 2025 institutional procurement precedent, not a track or a purchase commitment from the 2026 hackathon.** [Arbitrum DAO, STEP 2, thread started September 17, 2024 and updated for 2025](https://forum.arbitrum.foundation/t/non-constitutional-stable-treasury-endowment-program-2-0/26819).

## Stablecoins and payments

### Users and observable problems

One documented problem within the ecosystem is coordinating payment approval, documentation, and execution between organizations. The security subsidy fund report describes a project that transferred funds before signing work orders: funds had to be returned and the refund checked through its hash. It also records errors in amounts and signatures that required several rounds of communication. This demonstrates a concrete operational failure; it does not demonstrate current frequency or that a contract alone would solve it. [ADPC, outcome report, 2025](https://forum.arbitrum.foundation/t/arbitrum-security-subsidy-fund-outcome-report/28479).

Invoice and payment reconciliation is also documented for finance managers, but much of the accessible evidence comes from vendors. Request publishes attributed testimonials from managers at Gnosis, Verida, and Ocean Protocol about organization, vendor addresses, and invoicing. These indicate real tasks, with commercial selection bias and no independent measurement of the remaining problem. [Request Finance, accounts receivable, no visible date](https://www.request.finance/crypto-accounts-receivable).

### Competitors and substitutes

| Product | Verified features | Implication for a proposal |
|---|---|---|
| Request Finance | API for issuing invoices, tracking status, and generating payroll payments; automatic reconciliation, batch, and conversion contracts, including Arbitrum One. | “USDC invoices” and “automatic reconciliation” already exist. [API](https://docs.request.finance/), [contracts, June 25, 2026](https://help.request.finance/en/articles/10123680-smart-contracts-at-request-finance). |
| Safe | Automation and limit modules; agent-specific quickstart with per-token allowances and periodic renewal. | A daily agent budget is not sufficient differentiation either. [Agent guide](https://docs.safe.global/home/ai-agent-quickstarts/agent-with-spending-limit). |
| Sablier | Distribution protocol; Flow supports open-ended streams with accumulating debt and operations to fund and manage them. | Reusable components exist for continuous payments; rebuilding streaming reduces novelty. [Flow](https://docs.sablier.com/concepts/flow/overview). |
| MoonPay Commerce | Payment events through webhooks, history, retries, replay, and signature authentication. | Reliable payment tracking already has commercial infrastructure. Used as a functional comparison; Arbitrum compatibility was not verified here. [Webhooks](https://docs.hel.io/docs/webhooks). |

Documentation establishes capabilities, not effective quality for every segment. Prices were not checked and products were not tested; nor does the report assert that features not found are absent. A competitive gap requires a practical comparison of the specific workflow.

### Two focused opportunities, still hypothetical

**P1. Disbursement authorization between project, provider, and sponsor.** User: coordinator of a subsidy program that pays for services. Outcome: each party can check which approval is missing, which amount is due, and which transfer satisfies each obligation. The hypothesis derives from the ADPC incident, but whether that workflow remains problematic must be checked.

MVP: one agreement with two contributors, one provider, document hashes, explicit approvals, and payment in one token. The demo would show a blocked premature attempt, approval, and disbursement with a verifiable receipt. Private documents would remain offchain. Determining whether the work was good or whether signatures are legally valid would not be automated.

**Feasibility: medium in three weeks.** Agents can implement the contract, interface, and indexing; the human must validate the process with a coordinator and review permissions. The strongest counterevidence is that a checklist integrated with Safe or Request may be sufficient. Reject if no user needs coordination between parties, or if the contract merely replicates database states without providing verifiable execution.

**P2. Exception management for payments received outside checkout.** Hypothetical user: a crypto business support team that receives direct transfers and must resolve ambiguous cases. MVP: import an order and a hash; verify network, token, recipient, and amount; handle shortfalls or overpayments; produce an approved resolution and receipt. The intended differentiation is the exception case file shared between support and finance, not invoicing or basic payment detection.

**Feasibility: high for a prototype; demand evidence is weak.** It can be built without custody, with proposed refunds submitted for human approval. Anonymized incident examples are needed: this research did not find an independent series demonstrating volume. Reject if Request or the checkout provider already handles the entire workflow, if no recurring incidents emerge, or if almost all value lies outside Arbitrum.

## Tokenization and real-world assets

### Users and observable problems

There are three different users: an issuer administering investors, an integrator incorporating assets, and a treasurer who needs available funds. Confusing them leads to an overly broad platform.

Centrifuge documents network-specific permissions and different subscription, redemption, and transfer rules: access on one chain does not automatically authorize another. Its architecture includes asynchronous deposits and redemptions. These are real technical constraints for integrators, although they do not quantify support tickets. [Centrifuge, permissions](https://docs.centrifuge.io/user/concepts/access-permissions/); [Centrifuge, vaults](https://docs.centrifuge.io/developer/protocol/architecture/vaults/).

Spiko exposes execution cycles, cutoff times, and valuation methods; after the cutoff, an order may no longer be cancelable even while remaining unexecuted. This allows investigation of operational cash availability without inventing a need to “tokenize anything.” [Spiko, order lifecycle, documentation accessed September 9, 2026](https://docs.spiko.io/embedded/distributor_api_recipes/order_lifecycle/).

### Competitors and substitutes

| Product | Verified features | Implication for a proposal |
|---|---|---|
| Centrifuge | ERC-4626/7540/7575 vaults, asynchronous requests, and access controls. | Basic issuance and redemption infrastructure already exists; there may be potential for tools built on it. [Architecture](https://docs.centrifuge.io/developer/protocol/architecture/vaults/). |
| Tokeny | Platform, APIs, and ERC-3643 protocol for issuing, administering, and transferring assets with identity and permissions. | “KYC plus a token” is not a new proposal. [Solutions](https://docs.tokeny.com/docs/solutions-overview-1). |
| Spiko | APIs for treasury, orders, and withdrawals; banking methods and, for supported share classes and users, stablecoins. | A treasury dashboard needs to improve on an API and workflows already available. [Direct API](https://docs.spiko.io/direct/intro/welcome/), [withdrawals](https://docs.spiko.io/developers/distributor_api/reference/withdrawal-orders-create-withdrawal-order/). |
| Ondo | Tokenized products and subscription/redemption contracts; InstantManager requires registration of the exact calling address. | Authorized access is a real dependency; the existence of an ABI is not enough to promise integration. The cited guide uses Ethereum and does not confirm that same route on Arbitrum. [USDY integration](https://docs.ondo.finance/developer-guides/usdy-instant-manager-integration). |

These participants compete at different layers. They are not four interchangeable alternatives, and the report does not claim that every product is available to every user. USDY eligibility rules depend on jurisdiction and profile, according to its documentation; building an interface does not remove those conditions. [Ondo, current eligibility documentation reviewed](https://docs.ondo.finance/general-access-products/usdy/eligibility).

### Two focused opportunities, still hypothetical

**R1. Cash-availability monitor for treasuries holding tokenized assets.** User: an operator maintaining operating cash and positions in two products. Outcome: distinguish marked asset balances from usable money and track a pending redemption with the source of each status. MVP: two adapters, position, request, status, cutoff time, and warnings about missing information. No yield recommendations or automatic movement of funds.

**Feasibility: medium.** In three weeks, a real read and a clearly identified asynchronous testnet cycle could be demonstrated. The blocker is credentials, investor-specific data, and issuer-specific behavior. Counterevidence: Spiko already provides an order lifecycle and APIs; the treasury may also use only one provider. Reject if there is no user operating across providers or if a real adapter cannot be obtained before the end of week one. A simulator alone does not demonstrate a working integration.

**R2. Preflight diagnosis of operations involving restricted tokens.** User: a developer integrating a permissioned asset on Arbitrum. Outcome: explain before signing whether an operation will fail because of permissions, network, allowance, or vault state, with evidence from the queried contract. MVP: one protocol, four failure causes, and reproduction of each case before and after correction. It could be packaged as a developer tool, so it must also be compared with that vertical.

**Feasibility: medium-high for one protocol; low for universal coverage.** Agents can create the adapter, cases, and UI; the human obtains integrator feedback and defines which diagnoses are verifiable. The goal is not to certify legal eligibility. Counterevidence: contract errors and simulation may already be clear enough using existing tools. Reject if it does not materially improve diagnosis time or if each token requires bespoke maintenance that prevents scaling.

## Comparison and pending decision

| Opportunity | Problem evidence | Main dependency | Differentiation still to demonstrate |
|---|---|---|---|
| P1: coordinated disbursements | Historical public operational incident | Coordinator and current process | Advantage over a checklist, Safe, and Request |
| P2: payment exceptions | Hypothesis; insufficient validation | Real anonymized cases | Better management than current checkout/finance tools |
| R1: cash availability | Buyer requirements and documented cycles | APIs and a treasury with two providers | Value beyond each issuer's portal |
| R2: restriction diagnosis | Verified technical constraints | One protocol and integrator feedback | Improvement over existing simulators |

All four candidates deserve comparison with the other verticals before selection. The next filter should require a reproducible problem, access to a user or integrator, and an observable difference from the current substitute. Arbitrum's signal contributes ecosystem fit; it does not replace those three tests.

## Source inventory

All sources were accessed September 9, 2026. “No visible date” identifies dynamic documentation whose publication date was not established; it is not a launch date.

| Source and publisher | Date | Use in this report |
|---|---|---|
| [Arbitrum Open House — Singapore](https://luma.com/openhouse-singapore), Arbitrum/Luma | 2026 edition; no visible publication date | Suggested verticals and separation between Founder House and the buildathon. |
| [Arbitrum as the Settlement Layer for Stablecoins](https://blog.arbitrum.io/settlement-layer-stablecoins/), Arbitrum | January 13, 2026 | Promoted stablecoin use cases. |
| [Mastercard Taps Arbitrum For Global Stablecoin Settlement](https://blog.arbitrum.io/mastercard-stablecoin-settlement/), Arbitrum | June 3, 2026 | Institutional payment-infrastructure signal. |
| [Stable Treasury Endowment Program 2.0](https://forum.arbitrum.foundation/t/non-constitutional-stable-treasury-endowment-program-2-0/26819), Arbitrum DAO/thedevanshmehta | Thread: September 17, 2024; RFP: 2025 | Historical RWA procurement preferences and operational objections. |
| [Arbitrum Security Subsidy Fund: Outcome Report](https://forum.arbitrum.foundation/t/arbitrum-security-subsidy-fund-outcome-report/28479), ADPC/Arbitrum forum | 2025 | Early-payment incident, refund, and documentation errors. |
| [Crypto Accounts Receivable](https://www.request.finance/crypto-accounts-receivable), Request Finance | No visible date | Features and attributed commercial testimonials, with a bias limitation. |
| [Welcome — API Documentation](https://docs.request.finance/), Request Finance | No visible date | Invoicing, tracking, and payroll payments through the API. |
| [Smart contracts at Request Finance](https://help.request.finance/en/articles/10123680-smart-contracts-at-request-finance), Request Finance | June 25, 2026 | Reconciliation, batching, conversion, and deployment on Arbitrum One. |
| [AI agent with a spending limit for a treasury](https://docs.safe.global/home/ai-agent-quickstarts/agent-with-spending-limit), Safe | No visible date | Per-token allowances and periodic renewal for agents. |
| [Flow Overview](https://docs.sablier.com/concepts/flow/overview), Sablier | No visible date | Open-ended streaming, accrued debt, and stream management. |
| [Webhooks](https://docs.hel.io/docs/webhooks), MoonPay Commerce | No visible date | Events, retries, replay, and authentication signatures. |
| [Access and permissions](https://docs.centrifuge.io/user/concepts/access-permissions/), Centrifuge | No visible date | Permissions by network and action. |
| [Vaults](https://docs.centrifuge.io/developer/protocol/architecture/vaults/), Centrifuge | No visible date | Standards and asynchronous deposit/redemption requests. |
| [Orders Lifecycle](https://docs.spiko.io/embedded/distributor_api_recipes/order_lifecycle/), Spiko | No visible date | Cycles, cutoffs, and cancellation restrictions. |
| [Solutions Overview](https://docs.tokeny.com/docs/solutions-overview-1), Tokeny | No visible date | Platform, APIs, and permissioned tokenization protocol. |
| [Spiko Direct API](https://docs.spiko.io/direct/intro/welcome/), Spiko | No visible date | Treasury operations and data integration. |
| [Create withdrawal order](https://docs.spiko.io/developers/distributor_api/reference/withdrawal-orders-create-withdrawal-order/), Spiko | No visible date | Withdrawal methods and conditions for stablecoin use. |
| [Integrating with the USDY_InstantManager contract](https://docs.ondo.finance/developer-guides/usdy-instant-manager-integration), Ondo Finance | No visible date | Calling-address registration and limits of extrapolating the guide to Arbitrum. |
| [Eligibility](https://docs.ondo.finance/general-access-products/usdy/eligibility), Ondo Finance | No visible date | Access conditions by jurisdiction and profile. |
