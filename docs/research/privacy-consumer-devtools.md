# Privacy, consumer products, and developer tools on Arbitrum

## Scope and evidence quality

Research conducted September 9, 2026. This report compares three verticals under the same standard: explicit ecosystem signals, observable problems, existing alternatives, and opportunities sufficiently focused for a three-week build. The opportunities are product hypotheses, not validated demand or final recommendations. Competitor features come from their own publications; these sources verify supply, but not satisfaction, retention, or willingness to pay.

The [Open House Singapore listing on Luma](https://luma.com/openhouse-singapore) lists privacy, consumer products, and developer tooling among Founder House areas. This is guidance for the in-person program, not a ranking or three confirmed online buildathon prizes. The [online rules on HackQuest](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon) must govern final selection and eligibility. There is no evidence here that choosing one of these three areas alone increases the probability of winning.

## 1. Privacy

### Signals and documented problem

Arbitrum published a specific case about [Fhenix and private computation](https://blog.arbitrum.io/fhenix-private-computation/) in 2025: it describes using Nitro technology and CoFHE as infrastructure for computing on encrypted data. This is a concrete ecosystem technical signal, stronger than a generic category, but not a product request or confirmed event sponsorship.

The official positioning published June 15, 2026 reinforces enterprise confidentiality and selective disclosure to operators, auditors, and authorized teams. It describes architecture under development, not a guarantee of availability. This strategic signal is especially relevant to privacy-permission tools. [Arbitrum, Architecture of the Programmable Economy](https://blog.arbitrum.io/architecture-of-the-programmable-economy/).

Public information exposure can interfere with existing processes. In governance, Shutter documents bias caused by visible results during voting and includes testimonials attributed to ShapeShift, MoonDAO, and Layer2DAO about their use of encrypted voting. The evidence is commercial and selected by the provider, but identifies users and a real workflow. Its product already encrypts votes and reveals them when voting closes. [Shutter, Shielded Voting](https://shutter.network/shielded-voting/), no visible date.

Three requirements must be distinguished: hiding votes until voting closes, permanently hiding voter identity, and permanently hiding individual ballot contents while publishing the total. They are not equivalent. Shutter also announced work with Snapshot on permanently private voting in 2025; presenting that capability as a demonstrated market gap would therefore be incorrect. [Permanent Shielded Voting announcement](https://shutternetwork.discourse.group/t/permanent-shielded-voting-is-coming-to-snapshot/761).

### Existing alternatives and components

| Product | Documented function | Competitive implication |
|---|---|---|
| Fhenix CoFHE | Encrypted types in Solidity, client SDK, local mocks, and Ethereum, Arbitrum, and Base Sepolia testnets | It can be integrated; inventing a new FHE protocol is not a reasonable scope. |
| Zama | Confidential contracts, decryption permissions, coprocessors, and a gateway on an Arbitrum rollup | Its Arbitrum gateway does not establish application support on Arbitrum One. |
| RAILGUN | Privacy system deployed on Ethereum, BSC, Polygon, and Arbitrum; private operations | A general-purpose private wallet would face direct competition already deployed. |
| Semaphore | Group-membership proofs and anonymous signals, with onchain or offchain verification | Avoids designing custom circuits for membership credentials. |
| Snapshot + Shutter | Encrypted voting, reveal at close, and administrator-configurable integration | A generic private survey offers little differentiation. |

Sources: [CoFHE Quick Start](https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start), [Zama Litepaper](https://docs.zama.org/protocol/zama-protocol-litepaper), [RAILGUN Overview](https://docs.railgun.org/wiki), [Semaphore Learn](https://semaphore.pse.dev/learn), and [Shutter](https://shutter.network/shielded-voting/). Living documentation accessed on the date stated above. Fhenix currently states testnet availability with mainnet to follow; a demo must not be presented as production infrastructure. [Fhenix, availability](https://www.fhenix.io/).

### Two focused opportunities

**P1. Verifiable anonymous feedback for accelerator cohorts or technical communities.** Initial user: coordinator of a cohort with at least several dozen participants who wants responses exclusively from members without linking each response to an identity. The MVP would support a registry of commitments, one multiple-choice question, one response per member, and public access to the result. Semaphore already supports Arbitrum and Arbitrum Sepolia. [Network SDK](https://js.semaphore.pse.dev/functions/_semaphore_protocol_utils.getDeployedContract.html).

The demo would show a valid member, a rejected outsider, and a blocked duplicate attempt. The chain enables independent verification of the registry and accepted responses when the organizer and participants do not want to trust a single database. If everyone trusts the organizer, an anonymous form is probably sufficient. Anonymity against network metadata or a tiny registry cannot be promised either: the SDK explicitly warns about groups of one or two members. [Semaphore generateProof](https://js.semaphore.pse.dev/functions/_semaphore_protocol_proof.generateProof.html).

Estimated feasibility: medium, using existing circuits and a relayer; strongly dependent on preventing timing correlation and providing a careful onboarding experience. Condition for proceeding: a coordinator must identify a case requiring both verifiable eligibility and anonymity. Without that, it would be a cryptographic demo without a buyer. Documented demand for private voting does not automatically prove demand in this niche.

**P2. Confidentiality-permission tests for teams integrating CoFHE.** Initial user: a developer who needs to verify that an authorized account can decrypt a result and another cannot. MVP: a scenario runner with three roles, two example contracts, and reproducible evidence of allowed and denied access. Documentation already requires managing permissions with `FHE.allowThis` and `FHE.allowSender`; it also distinguishes mocks from actual operations. [CoFHE Quick Start](https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start).

The demo introduces an overly broad permission, causes an expectation to fail, and fixes it on Arbitrum Sepolia. It does not create new cryptography or present itself as an audit. It combines privacy and developer tools with a verifiable technical fit; the hypothesis is that existing tests leave friction when comparing behavior across roles and environments. That friction must be reproduced before building: if the starter kit already expresses it clearly, reject the idea. Estimated feasibility: medium; measure success through real defects detected and time saved, not the number of generated tests.

## 2. Consumer products

### Signals and documented problem

The Foundation's 2025 report describes adoption in gaming, collectibles, and prediction markets. It cites TapNation, Blackbird, OpenSea, and Hyve Labs; this demonstrates a variety of promoted applications, not that we should build another game or marketplace. Its wallet and NFT metrics represent ecosystem-reported activity, not retained users. [Arbitrum Foundation Transparency Report 2025, Ecosystem Growth](https://docs.arbitrum.foundation/assets/files/ArbitrumFoundationTransparencyReport2025-3ac117dd3203dbe7bca401cf951f0c14.pdf).

A community publication asks for everyday applications that are easy to recommend to newcomers who do not yet use browser wallets. This is a qualitative onboarding signal, not the Foundation's official position or a market study. [Consumer app list, October 2025](https://forum.arbitrum.foundation/t/a-list-of-arbitrum-based-consumer-apps/30132).

When looking for small products, it helps to examine limitations of tools organizers and communities already use. Luma documents that crypto-paid tickets cannot use its waitlist because the workflow requires authorizing payment and capturing it later; it also requires manual approval when a place opens up. POAP requires issuers to verify attendance and warns that claims by ineligible people undermine the reliability of the record. These are concrete problems, although they do not establish sufficient dissatisfaction to switch tools. [Luma Waitlist](https://help.luma.com/p/waitlist); [POAP Issuer Responsibilities](https://curation.poap.xyz/guidelines/issuer-responsibilities).

### Existing alternatives

| Product | Documented function | Competitive implication |
|---|---|---|
| Luma | Events, registration, waitlists with card authorization; ticket transfers on Enterprise | An event page with a QR code would be insufficient. |
| Unlock Protocol | NFT memberships, expiration, renewal, subscriptions, and access to experiences | Do not present tokenized memberships as novel. |
| POAP | Attendance collectibles, distribution, an application, and connections to experiences | Issuing an onchain badge is already a mature category. |
| Blackbird | Restaurant loyalty with benefits, tiers, and points for interactions | Its advantage includes a restaurant network and commercial operations, difficult to reproduce in three weeks. |

Sources: [Luma transfers](https://help.luma.com/p/ticket-transfer), [Unlock documentation](https://docs.unlock-protocol.com/), [POAP](https://poap.xyz/), and [Blackbird Club, April 8, 2025](https://www.thesupersonic.blackbird.xyz/p/introducing-the-blackbird-club). These are competitors or functional substitutes; they do not all need to use Arbitrum to compete for the same user task.

### Two focused opportunities

**C1. Waitlist with a refundable deposit for crypto community workshops.** Initial user: an organizer already accepting stablecoins, with limited capacity and currently handling cancellations manually. MVP: capacity, deposit, voluntary withdrawal with a refund, approval, and expiration. The demo fills a workshop, adds a person to the waitlist, and demonstrates deposit release or conversion into a ticket under visible rules. This is consumer/event operations with a payment component; it does not justify choosing payments as the dominant vertical.

Luma's limitation is direct evidence of a missing feature, but an escrow contract changes the economic model: it locks up funds, requires approval, and introduces contract risk. It is not equivalent to the card authorization Luma offers. Blockchain ticketing competition also exists, so the workflow should be compared with Unlock before implementation. Estimated feasibility: medium-high for a testnet pilot; exclude resale, a marketplace, multiple currencies, and disputes. Condition for proceeding: an organizer confirms that crypto payments and a waitlist are needed together; if a card or free registration solves the problem, reject the idea.

**C2. Shared benefit for a small workshop network: prove attendance and redeem once.** Initial user: three communities co-organizing activities that want to recognize attendance across events without importing spreadsheets. MVP: each issuer signs an attendance credential; someone collecting credentials from two different issuers earns a benefit redeemable once. The contract validates issuers, the requirement, and redemption. The demo uses credentials from two events, rejects a forged signature, and blocks double redemption.

A shared registry makes sense only with independent issuers and a benefit another organizer must verify. For an isolated event, a centralized system is simpler. POAP and Unlock could solve much of the work: the hypothetical difference is coordination among issuers, combined rules, and redemption operations, not the NFT. The main risk is distribution: obtaining agreements and a useful reward takes more than programming. Estimated feasibility: medium-high technically and medium-low commercially. Reject if at least two operators willing to recognize each other's credentials cannot be found.

## 3. Developer tooling and infrastructure

### Signals and documented problem

Ecosystem investment in tools is explicit: the [Stylus Sprint program](https://forum.arbitrum.foundation/t/stylus-sprint-program-updates/28790) records debugging, fuzzing, caching, and compiler projects. This supports the category and also demonstrates funded competition. It is not a list of needs that remain underserved.

An example of evidence aging: a November 2023 LimeChain publication describes friction in compilation, multi-project setups, and local testing. New solutions exist in 2026; reusing that diagnosis without checking it would lead to building tools for problems already solved. [LimeChain, Stylus experience](https://research.arbitrum.io/t/stylus-benchmarks-and-feedback/9526).

A current Foundation publication describes multi-contract workspaces, deployment order, address linking, compilation guards for tests, and the need for a real devnode for cross-contract integrations. This is a concrete, reproducible workflow to investigate, although it does not quantify problem frequency or cost. [Structuring Multi-Contract Stylus Projects Without Pain](https://blog.arbitrum.foundation/structuring-multi-contract-stylus-projects-without-pain/), 2026.

### Existing alternatives

| Tool | Documented function | Competitive implication |
|---|---|---|
| Stylus SDK + Cargo Stylus | Rust contracts interoperable with Solidity, interface export, and deployment tools | A basic contract generator duplicates the official starting point. |
| Walnut's StylusDB | Line-by-line debugging, breakpoints, state, and multiple contracts; integrated with the official CLI | A concrete “Stylus debugger” already exists. |
| Stylus Trace Studio | Visual profiling, flamegraphs, local environment, and shareable artifacts | A generic gas dashboard enters an already covered space. |
| Tenderly | Simulation, virtual environments, exploration, and debugging with Arbitrum support | Check which specific detail is missing before competing. |
| Official Retryable Dashboard | Querying and executing pending cross-chain messages | Looking up pending tickets by hash is already supported. |

Sources: [Official SDK](https://github.com/OffchainLabs/stylus-sdk-rs), [Walnut, May 11, 2026](https://walnut.dev/blog/stylusdb-announcement), [Trace Studio, 2026 final report](https://forum.arbitrum.foundation/t/stylus-trace-studio-final-report/30981), [Tenderly integration](https://tenderly.co/blog/you-can-now-use-arbitrum-on-tenderly/), and [official troubleshooting documentation](https://github.com/OffchainLabs/arbitrum-docs/blob/master/docs/partials/_troubleshooting-users-partial.mdx).

### Two focused opportunities

**D1. Deployment verifier for mixed Solidity/Stylus projects.** Initial user: a team with two or more contracts that needs to check that its CI deployment respects dependencies, ABIs, and linked addresses. MVP: a manifest, deployment to a devnode, declarative checks, and a report with transactions, versions, and results. The demo introduces an incorrect address, detects the integration failure, and shows the corrected deployment.

The differentiation hypothesis is to make the transition between compilation, deployment, and linking reviewable and reproducible; it does not replace the SDK, debugger, or framework. The chain serves as an environment that must be reproduced faithfully; reports do not need tokenization. Estimated feasibility: medium, restricted to one official pattern. Rejection criterion: existing scripts or a standard tool configuration cover the workflow with equal clarity. Validate against two repositories outside this project; testing only our own examples would not demonstrate external usefulness. It could end up as scripts without a sustainable product. Its fit as a tooling submission under the online rules remains to be confirmed; a requirement for a new custom contract should not be inferred.

**D2. Retryable failure rehearsal and runbook for teams using Ethereum–Arbitrum messaging.** Initial user: a developer responsible for a contract sending messages between chains. MVP: generate controlled execution or gas failures, display states, and document reproducible manual recovery on testnet. A tutorial already creates and redeems a failed retryable, so the value must lie in tests integrated into the team's workflow and contextual diagnosis, rather than repeating that example. [Offchain Labs, Arbitrum Tutorials](https://github.com/OffchainLabs/arbitrum-tutorials).

The demo triggers a failure, distinguishes delivery from execution, fixes the cause, and verifies redemption. The official dashboard already supports message recovery; the proposed product would operate before the incident, through training and validation. Estimated feasibility: medium-low because of two chains and asynchronous states; restrict it to one message type. Condition for proceeding: a team must show a workflow it does not currently verify and adopt the rehearsal. If it only wants an explorer, the right choice is the official one. Offchain Labs also publishes [failed retryable monitoring](https://github.com/OffchainLabs/arb-retryables-monitoring): a generic alert is not a demonstrated gap either.

## Comparison and next validation

| Vertical | Best available evidence | Decisive uncertainty | Test before choosing |
|---|---|---|---|
| Privacy | Encrypted-voting integrations and users; CoFHE and Semaphore available | Specific need and guarantees that matter | Reproduce a case with real roles and compare it with existing Shutter/Semaphore capabilities. |
| Consumer | Explicit Luma limits and POAP operational rules | Distribution, switching tools, and attendee benefit | An organizer shows their last event and tries the alternative workflow. |
| Developer tools | Documented workflows and tool funding | A gap that survives products launched in 2026 | Solve the same case with existing tools before writing a new one. |

This evidence does not support declaring a winner. The six hypotheses enable a comparable next round: each must secure an identifiable user, a reproduced alternative, and an observable improvement. Agent-led construction can be documented through tasks, tests, and human reviews; it does not replace those three conditions or demonstrate product differentiation by itself.


## Main source inventory

Accessed September 9, 2026. Crawl dates are not treated as editorial dates. Additional specific references are linked in the text.

| Title/publisher | Date or period | Use |
|---|---|---|
| [Open House Singapore, Arbitrum/Luma](https://luma.com/openhouse-singapore) | 2026 event listing | In-person verticals. |
| [Online Buildathon, Arbitrum/HackQuest](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon) | 2026 event listing | Distinct online rules. |
| [Architecture of the Programmable Economy, Arbitrum](https://blog.arbitrum.io/architecture-of-the-programmable-economy/) | June 15, 2026 | Strategic confidentiality. |
| [Quick Start, Fhenix](https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start) | No visible date | Networks, permissions, and mocks. |
| [Litepaper, Zama](https://docs.zama.org/protocol/zama-protocol-litepaper) | No visible date | Gateway versus host chain. |
| [Overview, RAILGUN](https://docs.railgun.org/wiki) | No visible date | Deployed competitor. |
| [Learn, Semaphore/PSE](https://semaphore.pse.dev/learn) | No visible date | Anonymous primitives. |
| [Shielded Voting, Shutter](https://shutter.network/shielded-voting/) | No visible date | Product and testimonials. |
| [Transparency Report, Arbitrum Foundation](https://docs.arbitrum.foundation/assets/files/ArbitrumFoundationTransparencyReport2025-3ac117dd3203dbe7bca401cf951f0c14.pdf) | 2025 reporting year | Consumer products and tooling. |
| [Waitlist, Luma](https://help.luma.com/p/waitlist) | No visible date | Crypto limitation. |
| [Issuer Responsibilities, POAP](https://curation.poap.xyz/guidelines/issuer-responsibilities) | No visible date | Eligibility. |
| [Documentation, Unlock](https://docs.unlock-protocol.com/) | No visible date | Existing memberships. |
| [Blackbird Club, Blackbird Labs](https://www.thesupersonic.blackbird.xyz/p/introducing-the-blackbird-club) | April 8, 2025 | Existing loyalty program. |
| [Multi-Contract Stylus, Arbitrum Foundation](https://blog.arbitrum.foundation/structuring-multi-contract-stylus-projects-without-pain/) | 2026 | Deployment and testing. |
| [Official Debugger, Walnut](https://walnut.dev/blog/stylusdb-announcement) | May 11, 2026 | Existing debugging coverage. |
| [Trace Studio Final Report, team/Arbitrum forum](https://forum.arbitrum.foundation/t/stylus-trace-studio-final-report/30981) | 2026 | Existing profiling coverage. |
| [Arbitrum Integration, Tenderly](https://tenderly.co/blog/you-can-now-use-arbitrum-on-tenderly/) | 2022 | Arbitrum integration; does not establish specific Stylus features. |
| [Arbitrum Tutorials, Offchain Labs](https://github.com/OffchainLabs/arbitrum-tutorials) | Living repository | Retryables. |
| [Retryables Monitoring, Offchain Labs](https://github.com/OffchainLabs/arb-retryables-monitoring) | Living repository | Existing alerts. |
