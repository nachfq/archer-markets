# DeFi, financial infrastructure, and agentic AI

## Scope and evidence quality

This analysis compares two verticals for Open House Singapore without choosing a product yet. Research cutoff: September 9, 2026. It distinguishes organizer signals, problems described by providers, and hypothetical opportunities. Documentation allows verification of features and restrictions; by itself, it does not demonstrate willingness to pay, retention, or an underserved market. Build estimates assume three weeks, human coordination, and specialized agents; they do not constitute a production-security assessment.

## What Arbitrum asks for and what it does not

The **in-person Founder House** listing mentions both DeFi/financial infrastructure and AI/agentic finance. Its Promising Products Track includes frontier areas such as agents and new financial primitives. This is explicit guidance, but neither a quantified preference between verticals nor a rule that automatically transfers to the online event. [Arbitrum, Singapore listing, no visible editorial date](https://luma.com/openhouse-singapore).

The **online buildathon** explicitly accepts DeFi and other applications. It evaluates contract quality, potential to attract and retain users, innovation, and real need. It requires deployment on an Arbitrum chain; it publishes minimum prize allocations by chain, not a specific allocation for these two verticals. Its resources include ZeroDev: this is a clue about available tools, not a request to build another wallet. [HackQuest, Singapore rules, accessed September 9, 2026](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon).

## DeFi and financial infrastructure

### Signals and documented problems

The February DRIP report, published by Entropy on March 9, 2026, attributes new Morpho, Euler, Maple, InfiniFi, Reservoir, and Resolv deployments to the program. Its stated lesson prioritizes lending-market liquidity depth and products with an existing value proposition. It also acknowledges retention limits and protocol-specific constraints. This supports infrastructure around existing markets; it does not prove that another lending protocol will attract users. The report is a retrospective of an incentive program, not a current measurement of organic demand. [DRIP February 2026 Update](https://forum.arbitrum.foundation/t/drip-february-2026-update/30628).

**Lenders and teams holding reserves in vaults** face decisions about exposure, exit liquidity, and configuration changes. Morpho asks users to evaluate curators, collateral, oracles, LLTV, and fees; it acknowledges that withdrawal liquidity may be insufficient and that privileged functions affect users. There is a verifiable operational problem. The commercial question remains open: who needs an additional tool rather than delegating analysis to the curator? [Morpho FAQ, current documentation](https://morpho.org/faq).

**Vault operators and emergency responders** have a more specific task: detect dangerous changes, revoke proposals, and progressively remove liquidity when available. Morpho documents different sequences by incident, roles with different capabilities, and cases where action order matters. The documentation demonstrates complexity, but also that the provider already offers an interface to address it. [Morpho Vaults V2, Emergency Procedures](https://docs.morpho.org/curate/tutorials-v2/emergency/).

### Competitors and substitutes

| Product | Verified features and competitive implications |
|---|---|
| Aave | The interface displays supplied assets, collateral, and health factor; governance sets borrowing and liquidation parameters. An elementary risk indicator is not differentiation. [Collateral documentation](https://www.aave.com/help/supplying/toggle-collateral-status). |
| DeFi Saver | Liquidation protection, automated leverage management, stop loss, and other rules; it also offers Aave position exploration and price simulation. Arbitrum already appears among its networks. A generic “risk copilot” would compete with an established product. [Automation](https://defisaver.com/features/automation), [product](https://defisaver.com/). |
| Morpho / Curator App | Vault configuration and operation, emergency actions, change revocation, and deallocation. Rebuilding that console would be redundant. The specific Arbitrum vault version must be checked before integrating V2. [V2 procedures](https://docs.morpho.org/curate/tutorials-v2/emergency/). |
| Gauntlet VaultBook | Publishes curation frameworks, risk assessments, and methodologies. It is an informational substitute, not a wallet: it reduces the value of merely collecting risk explanations. [Introducing VaultBook](https://www.gauntlet.xyz/resources/introducing-the-gauntlet-vaultbook-demystifying-vault-curation). |
| Tenderly | Simulates transactions and allows changes to state, accounts, and time. It is technical infrastructure and a substitute for teams able to prepare their own scenarios. “Simulate before signing” is not an empty space either. [Platform](https://tenderly.co/). |

### Two small opportunities to investigate

**D1. Risk-change inbox for a vault depositor.** User: the reserve manager of a team already depositing in one or two Arbitrum vaults. Workflow: compare approved configuration against a pending change, explain its effect, calculate affected exposure, and prepare a simulated exit. The hypothetical gap is turning scattered changes into an operational decision for the depositor, with a shared review history. It would not be an APY ranking or automated financial adviser.

**Three-week MVP:** index events from one Morpho version, cover three change types, display before/after configuration, simulate withdrawals, and keep a minimal record of shared policies or approvals. A custom contract makes sense only if those policies govern a real operation; recording decorative hashes would weaken the project. Demo a controlled testnet change and clearly identified read-only data from a real vault. **Medium** feasibility: RPC access, ABI, and liquidity availability in the demo environment must be resolved early. Abandon if the existing interface provides the same workflow or if depositors neither review changes nor delegate that task to an owner.

**D2. Emergency rehearsal for a vault operator.** User: a small curator or integration team that needs to prepare procedures before an incident. Workflow: choose a specific scenario—an illiquid market and a pending change—execute the procedure on a fork, check authorizations, and produce a reproducible package for signers. Hypothetical difference: an incident script and operational evidence, rather than a general simulator.

**MVP:** one protocol version, two roles, and two scenarios; repeatable simulations and verified preconditions before preparing transactions. **Medium** feasibility when built on existing infrastructure. Prize-fit risk: a purely offchain product may need rethinking to satisfy useful deployment on Arbitrum. Abandon if operators prefer their scripts, require many integrations from day one, or no curator is willing to evaluate the procedure. The documentation confirms tasks, but not yet a buyer.

## AI and agentic finance

### Signals and documented problems

On July 8, 2026, Arbitrum announced network support in Coinbase's x402 facilitator and an open implementation of MPP. There are TypeScript examples and payment authorization/settlement for services. The announcement itself describes the category as early: standards, interfaces, and dominant use cases are still forming. This enables a demo; it does not establish adoption of whichever product is selected. [Arbitrum Supports x402 and MPP For Agentic Finance](https://blog.arbitrum.io/x402-and-mpp-for-agentic-finance-on-arbitrum/).

A more distinctive signal is the Foundation's June 3 article: it argues that settlement and payments are becoming common infrastructure and that verifying **what the agent or provider did** matters. It presents Offchain Labs research on inference verification and calls for exploring trust in AI for Founder House London. This is ecosystem guidance, not a Singapore requirement. It also does not support claiming that a signed receipt demonstrates correct model execution: that research has a specific threat model and detection probabilities. [The agent economy has a verification problem](https://blog.arbitrum.foundation/the-agent-economy-has-a-verification-problem/).

Plausible users are developers delegating onchain operations and operators of services consumed by agents. Their documented problems include permissions, limits, and verifiability. Existing commercial infrastructure demonstrates that those features matter to providers; sufficient public cases are still missing to attribute unmet demand to a small segment.

**Counterevidence to originality:** London already awarded AlphaGrid (agents competing for capital), CanHav Research (private research/execution), and ReineiraOS (capital-backed commitments and compensation for breaches). These are July precedents, not Singapore rules or products audited here. They rule out treating “agent accountability” as an empty space. [Foundation, London awards, July 15, 2026](https://blog.arbitrum.foundation/top-founders-take-home-300k-at-london-founder-house/).

### Competitors and substitutes

| Product | Verified features and competitive implications |
|---|---|
| Coinbase Agentic Wallets | Skills for sending, trading, and using services; transaction and session limits; keys isolated from model context. The page highlights trading on Base: do not assume identical per-feature support on Arbitrum. A “budgeted wallet for agents” already exists. [Product](https://www.coinbase.com/en-gb/developer-platform/products/agentic-wallets). |
| ZeroDev | Composable session permissions; restrictions by contract/function, gas, frequency, and time. It is a usable component and a direct substitute for a generic permission manager. The detailed reference reviewed is SDK v5.3.x, marked as an older version: pin the version and integrate according to current documentation. [Permissions](https://docs.zerodev.app/sdk/v5_3_x/permissions/intro), [current documentation](https://docs.zerodev.app/). |
| Brian | Translates prompts into transactions; documents transfers, swaps, bridges, deposits/withdrawals, and Aave actions, with Arbitrum among supported networks. A chat interface for DeFi is weakly differentiated. [API](https://docs.brianknows.org/brian-api/apis), [actions and networks](https://docs.brianknows.org/brian-api/apis/transaction/actions-networks-and-tokens-supported). |
| Fireblocks | Agentic Payments Suite combines delegated access, policies, an x402 facilitator, and settlement traceability; it targets fintechs and payment providers. A spending history is not new territory either. Its page invites users to request access; do not assume immediate integration for the hackathon. [Suite](https://www.fireblocks.com/products/agentic-payments). |

### Two small opportunities to investigate

**A1. Adversarial permission tests for onchain agents.** User: a team about to enable an agent for a limited financial function. Deliverable: a suite attempting forbidden destinations, overspending, expiration, replays, and batched transactions; it shows what was rejected by verifiable policy and what was avoided only through agent behavior. Gap hypothesis: evaluation and reproducible evidence for a specific configuration, built on existing wallets. This is a software-control product, not a trading agent.

**MVP:** one smart account, one test token, one allowed action, and six prohibited attempts; reproducible replay of every case on Arbitrum Sepolia. **Relatively high** feasibility using existing permissions without creating a new wallet. The difference from internal tests and Tenderly needs validation; onchain value lies in testing the deployed mechanism. Abandon if it requires supporting every wallet or becomes only a collection of tests without a user who needs to review it periodically.

**A2. Contracting deterministic jobs with verifiable acceptance.** User: operator of a specialized API consumed by agents; a limited example is building an onchain event index for an agreed block and schema. Workflow: agree on input, price, and acceptance condition; deliver a signed result; an independent verifier checks the bounded case and enables settlement. Hypothesis: a useful product when client and provider do not share an account or prior contract.

**MVP:** one deterministic job, one provider, and an identified verifier; escrow with a timeout and explicit acceptance. **Medium** feasibility; the main dependency is designing who verifies and who can lie. Do not present a hash as proof of truth or extend the claim to general “verifiable AI.” Compare against a prepaid API and x402 before building. Abandon if the parties prefer conventional invoicing, verification costs as much as execution, or the case requires subjective arbitration. Its connection to agents is autonomous consumption, not agents programming the repository.

ReineiraOS particularly weakens A2: before selecting it, check whether the acceptance workflow for that job differs concretely from its commitments and compensation. Without that evidence, keep A2 as a low-priority exploration.

## Criteria for continuing

None of these four proposals has been validated as a product. D1 and A1 are relatively focused candidates for checking interest and overlap; D2 and A2 offer alternatives with greater dependence on specialized operators. The next decision must compare these options with the other five verticals under the same threshold: an identifiable user, an existing task, a known alternative, a demonstrable difference, and a necessary Arbitrum component. There is no evidence for choosing payments by default or requiring AI in the product because the repository is built by agents.

## Source inventory

All accessed September 9, 2026. “Undated” means no editorial date was identified; it does not mean recently published. Capabilities reflect the documentation reviewed, without product testing.

| Title / link | Publisher | Visible date | Use |
|---|---|---|---|
| [Open House Singapore](https://luma.com/openhouse-singapore) | Arbitrum / Luma | 2026 edition; editorial date unavailable | In-person verticals |
| [Online Buildathon](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon) | Arbitrum / HackQuest | 2026 edition; editorial date unavailable | Online rules, deployment, resources |
| [DRIP February 2026 Update](https://forum.arbitrum.foundation/t/drip-february-2026-update/30628) | Entropy / Arbitrum forum | March 9, 2026 | DeFi signals and incentive limitations |
| [FAQ](https://morpho.org/faq) | Morpho | Undated | Vault risk and liquidity |
| [Emergency Procedures, Vaults V2](https://docs.morpho.org/curate/tutorials-v2/emergency/) | Morpho | Undated | Tasks and the Curator App alternative |
| [Toggle Collateral Status](https://www.aave.com/help/supplying/toggle-collateral-status) | Aave | Undated | Existing features and health factor |
| [Automation](https://defisaver.com/features/automation), [product](https://defisaver.com/) | DeFi Saver | Undated | Automation, exploration, and simulation |
| [Introducing VaultBook](https://www.gauntlet.xyz/resources/introducing-the-gauntlet-vaultbook-demystifying-vault-curation) | Gauntlet | Editorial date not retrieved | Public curation frameworks |
| [Simulation company](https://tenderly.co/) | Tenderly | Undated | Simulation and state overrides |
| [x402 and MPP on Arbitrum](https://blog.arbitrum.io/x402-and-mpp-for-agentic-finance-on-arbitrum/) | Emre Dincoglu, Milo Booke / Arbitrum | July 8, 2026 | Integration and early maturity |
| [The agent economy has a verification problem](https://blog.arbitrum.foundation/the-agent-economy-has-a-verification-problem/) | Ben Greenberg / Arbitrum Foundation | June 3, 2026 | Direction toward verification |
| [London Founder House winners](https://blog.arbitrum.foundation/top-founders-take-home-300k-at-london-founder-house/) | Arbitrum Foundation | July 15, 2026 | Competition and prize precedents |
| [Agentic Wallets](https://www.coinbase.com/en-gb/developer-platform/products/agentic-wallets) | Coinbase | Undated | Features, guardrails, and Base emphasis |
| [Permissions v5.3.x](https://docs.zerodev.app/sdk/v5_3_x/permissions/intro), [current docs](https://docs.zerodev.app/) | ZeroDev | Undated; versioned reference | Existing permissions and version limitation |
| [APIs](https://docs.brianknows.org/brian-api/apis), [actions and networks](https://docs.brianknows.org/brian-api/apis/transaction/actions-networks-and-tokens-supported) | Brian | Undated | Prompts to transactions and Arbitrum |
| [Agentic Payments Suite](https://www.fireblocks.com/products/agentic-payments) | Fireblocks | Undated | Permissions, settlement, traceability |
