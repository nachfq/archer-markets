# Product opportunities for Arbitrum Open House Singapore

Historical research from September 9, 2026, before product selection. For the current
platform, see [How Archer Markets works](../how-it-works.md).

## Findings

Comparing the seven verticals does not justify choosing payments by default or declaring a winner. It does allow us to replace broad themes with fourteen focused hypotheses, identify existing alternatives, and distinguish documented needs from commercial assumptions. The best next decision is to select problems to test against users and current tools, keeping several verticals in contention.

Three findings change the selection process. First, payment, wallet, permission, and simulation infrastructure already covers many easy ideas. Second, there are concrete problems in operating restricted assets, agent verification, privacy, and contract deployment. Third, demonstrating that a task is complex does not demonstrate that someone needs a new product to solve it.

**No product has been selected, commercial demand has not been validated, and no probability of winning a prize has been estimated.** The opportunities in this report are candidates for investigation. Building with agents under human coordination describes the process; it does not require the product to involve AI.

## Reading this report

| Document | Contents |
|---|---|
| [Arbitrum signals and event requirements](arbitrum-signals.md) | Public requirements, team guidance, previous editions, and evidence limitations |
| [Stablecoins/payments and RWA](payments-rwa.md) | Users, competition, problems, and four hypotheses |
| [DeFi and agentic AI](defi-agents.md) | Users, competition, problems, and four hypotheses |
| [Privacy, consumer products, and tools](privacy-consumer-devtools.md) | Users, competition, problems, and six hypotheses |

The research cutoff is September 9, 2026. The documents place links alongside claims and provide references for further reading. Provider capabilities were checked through documentation and announcements, not through product testing. Historical dates are retained because a need identified in 2025 may have been addressed by 2026.

## What Arbitrum communicates

The program's guidance includes all seven areas studied. The buildathon publishes criteria focused on product, execution, and innovation; the Founder House list is not a prize allocation table by vertical. The full analysis of sources and conditions is in [Arbitrum signals](arbitrum-signals.md). [In-person event listing](https://luma.com/openhouse-singapore), [online listing](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon).

Among the specific signals, a DevRel publication highlights verification of what an agent does, beyond the payment mechanism. Arbitrum's published architecture also focuses on selective confidentiality and enterprise operations. These are directions to investigate, not validated demand or guaranteed availability of every capability. [Verification](https://blog.arbitrum.foundation/the-agent-economy-has-a-verification-problem/), [architecture](https://blog.arbitrum.io/architecture-of-the-programmable-economy/?ref=blog.arbitrum.foundation).

## Comparing the seven verticals

This matrix summarizes analytical judgment based on the appendices. “Evidence” refers to the problem or constraint, not market size. Feasibility assumes a reduced three-week scope; it does not imply production readiness.

| Vertical | Most useful evidence found | What already exists | Biggest unknown for a small product |
|---|---|---|---|
| Stablecoins and payments | Operational incidents involving coordination among payers, providers, and sponsors | Request, Safe, Sablier, MoonPay Commerce | Whether the remaining problem requires more than integrating tools and improving a process |
| Tokenization/RWA | An institutional buyer's requirements and explicit permission and redemption restrictions | Centrifuge, Tokeny, Spiko, Ondo | Access to users, data, and assets; ability to provide value without becoming an issuer |
| DeFi/financial infrastructure | Documented exposure-control and incident-response tasks | Aave, DeFi Saver, Morpho Curator App, Gauntlet, Tenderly | Which operator or depositor task remains insufficiently addressed |
| AI/agentic finance | Explicit direction toward trust and verification; permissions available in SDKs | Coinbase, ZeroDev, Brian, Fireblocks, and prize-winning projects | Whether the proposed evaluation or evidence improves on internal tests and current solutions |
| Privacy | Encrypted voting in use and explicit management of decryption permissions | Fhenix, Zama, RAILGUN, Semaphore, Shutter/Snapshot | Who needs which specific guarantee and accepts the usability complexity |
| Consumer products | Specific constraints in event tools and credential issuance | Luma, Unlock, POAP, Blackbird | Distribution and a reason to switch tools; whether onchain operation is worthwhile |
| Tools/infrastructure | Current Stylus integration and message-recovery workflows | Official SDK, StylusDB, Trace Studio, Tenderly, retryables dashboard | Difference from scripts and recent tools; fit between the deliverable and the competition |

The matrix does not compare equivalent products: some participants are direct competitors, others are components or functional substitutes. Their inclusion does not confirm that all their features are available on Arbitrum. The appendices identify cases where that compatibility was not verified.

## Map of fourteen hypotheses

The following identifiers are global to make comparison easier; the appendices develop each proposal. “Conditional” means there is a documented problem or capability, but the competitive gap remains an open question. “Exploratory” means additional evidence is needed even before arguing for that gap. Neither label means a proposal has been selected.

| ID | User and task | Smallest conceivable demo | Status and main rejection criterion |
|---|---|---|---|
| PAY-1 | Coordinator: authorize disbursements between organizations | Block a premature payment and execute it after approvals | Conditional: reject if Safe/Request and a checklist are sufficient |
| PAY-2 | Support: resolve payments received outside checkout | Link an order, transfer, and exception resolution | Exploratory: evidence of recurrence and remaining cost is missing |
| RWA-1 | Treasury: understand cash availability during redemptions | Status of two positions and an asynchronous redemption | Conditional: data access and a need across providers |
| RWA-2 | Integrator: diagnose a restricted operation | Explain and fix four failures in one protocol | Conditional: must improve on existing errors and simulators |
| DEFI-1 | Depositor: review changes affecting exposure | Before/after change and simulated exit | Conditional: a user willing to own this review is missing |
| DEFI-2 | Curator: rehearse an emergency procedure | Two scenarios and roles in a reproducible fork | Conditional: scripts or Curator App may be sufficient |
| AI-1 | Integrator: check an agent's effective limits | One allowed action and six reproducible prohibited attempts | Conditional: risk of remaining a collection of tests |
| AI-2 | API operator: accept a verifiable deterministic job | One result, verifier, and conditional settlement | Exploratory: verification cost and strong overlap |
| PRIV-1 | Coordinator: receive anonymous feedback from valid members | Reject outsiders and duplicates without publishing identity | Exploratory: a form or Shutter may be sufficient |
| PRIV-2 | CoFHE integrator: check access to encrypted results | Detect an excessive permission among three roles | Conditional: first reproduce a starter-kit limitation |
| CON-1 | Organizer: manage a waitlist for crypto tickets | Capacity, deposit, and refund/approval | Conditional: a deposit is not equivalent to card authorization |
| CON-2 | Communities: recognize attendance across issuers | Two credentials and a single redemption | Exploratory: depends on agreements and a useful benefit |
| DEV-1 | Solidity/Stylus team: verify deployment and contract links | Detect an incorrect dependency or address | Conditional: existing scripts may solve it |
| DEV-2 | L1/L2 integrator: rehearse failed messages | Trigger a failure and verify retryable recovery | Conditional: two networks, asynchronous states, and existing tutorials |

The overlaps are deliberate. RWA-2 also belongs to tooling; PRIV-2 combines privacy and testing; AI-1 combines agents and software control. The classification organizes evidence rather than manufacturing seven independent markets. CON-1 touches payments, while CON-2 explores consumer products through coordination and credentials.

## Ideas that are becoming harder to justify

The review weakens USDC invoicing, budgeted wallets, chat interfaces for executing DeFi, generic simulation, NFT memberships, private surveys, and generic Stylus debugging as standalone proposals. All have concrete functional alternatives in the appendices. This does not rule out building an integration or serving a specific segment; it requires demonstrating which task improves and for whom.

It also argues against turning the MVP into a new asset issuer, credit system, cryptographic protocol, or complete social network. This is a scope judgment: these depend on relationships, guarantees, or distribution that generated software cannot secure by itself. A limited prototype on existing infrastructure may be feasible, provided its difference is more than a change of interface.

An infrastructure problem can offer an excellent technical fit and little product substance. In particular, DEV-1, DEV-2, DEFI-2, AI-1, and PRIV-2 need to explain who will use the result repeatedly and how to demonstrate a deployment relevant to the competition. The public listing does not explicitly require inventing a new contract; adding a decorative one would not resolve the fit either. Detailed eligibility for this format remains pending review of the complete terms.

## How to choose without biasing the research again

The recommended next step is a comparative validation round, rather than starting to implement one hypothesis. First, apply a short test to all fourteen: locate a reproducible case, run or inspect the current substitute, and specify a measurable improvement. Record those that fail this filter as rejected, with a reason.

Then take three or four candidates from different areas into more costly validation. Selection should depend on the observed improvement over the substitute and actual access to evidence and users. The matrix does not yet resolve those two unknowns: prioritizing the most technically familiar proposals now would reintroduce bias. Rejections should also be recorded so that an appealing idea does not return without new evidence.

Each candidate should produce a brief with five outcomes:

1. An identifiable user and a task they already perform, supported by first-hand or public evidence.
2. A complete case solved using the current alternative: steps, limitations, and observed cost.
3. A proposed measurable difference: diagnosis time, detected errors, manual operations, or verifiable guarantees.
4. A minimum workflow and its necessary function on Arbitrum, with accessible dependencies.
5. A concrete rejection condition and the evidence still missing.

The gate for starting implementation is that at least one external user agrees to try the workflow and the case is not already sufficiently addressed by the alternative. A promised interview is not a purchase; even so, it is more useful evidence than claiming product-market fit from an announcement. Human coordination is especially valuable for obtaining that access and assessing usefulness; agents can investigate competition, prepare cases, and check feasibility.

## Limitations and open questions

The online research found real restrictions and commercial signals, but did not validate willingness to pay or retention. Provider sources describe supply and carry commercial bias. No interviews, integration tests, or organizer contacts were conducted. Historical incidents and RFPs serve as leads, not confirmed current needs.

The complete Singapore terms were inaccessible; eligibility therefore remains unresolved for a team coordinated by one person with agent contributions and for each tooling format. The [event requirements document](arbitrum-signals.md) records the link and limitations. Deploying test fixtures alone does not ensure that the organizer will consider the product deployed. Chosen technical infrastructure must be tested on the specific network and version before committing to scope: PRIV-2 must check actual permissions and decryption, not only mocks; RWA-2 must have access to the asset and protocol on Arbitrum, not merely an Ethereum guide.

## Sources and traceability

Complete references appear in the four documents linked at the beginning, organized by claim and vertical. Comparative conclusions and rejection criteria are analytical judgments derived from those findings; the fourteen opportunities are proposals, not official requests from Arbitrum.
