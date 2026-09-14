# Stock Options Lab frontend

React/TypeScript, wagmi and viem on Vite/vinext with the existing Sites scaffold.
The web consumes the standalone SDK; wallet signing stays with the connected user.

## Deployment status

V3 requests are implemented in source. Robinhood Chain Testnet has no configured factory
or payment-token deployment, and no public V3 acceptance run is claimed. A hosted frontend
is independent of protocol deployment. Local Anvil fixtures and RPC forks are separate
forms of development evidence; see the root README and dated implementation record.

## Run

Follow the root README to install, compile and deploy a local V3 market. Then run
`npm run dev:local` from the root for chain 31337. `npm run dev` selects chain 46630,
where trading stays disabled without valid addresses. `VITE_CHAIN_ID` is build-time
configuration; changing it requires a restart/rebuild.

`lib/generated/deployments.json` contains public addresses and network configuration.
`npm run abi` generates SDK ABIs; the web re-exports them. No keys belong in frontend
code or environment variables. Existing V1/V2 contracts retain their original terms.
Requests require a V3 factory; the SDK verifies the configured version against the RPC.

## Product surfaces

- Trade → Buy Options: written and resale options grouped by expiry and strike, with
  ownership filters. Each row is a complete option, not pooled liquidity.
- Trade → Write Options: enter a quantity in multiples of 0.1 token, exact total exercise
  payment and total premium, then review the collateral deposit before signing.
- Trade → Buy Requests: reserve a premium, browse open requests, manage your own requests,
  review complete writer acceptance, or recover an unaccepted premium.
- Portfolio: available funds, option collateral, reserved/refundable request premiums,
  onchain requests, current positions and historical positions across configured markets.
- Activity: browser-local submissions with onchain receipt reconciliation.
- Docs: mechanics, deadlines, collateral, requests, resale and environment limitations.

Every request has an acceptance deadline earlier than its option expiration. Until
acceptance it holds only a premium in factory escrow; acceptance creates one independent
option holding the writer collateral. A quantity of 10 tokens is one 100-lot option.
No partial fill or automatic matching is implemented. Request refunds and option exercise
require manual transactions. Reviewing does not send a transaction.

## Validation

From the root: `npm test`, `npm run typecheck`, `npm --prefix web run lint`, `npm run build`.
The root `npm run test:e2e` checks financial lifecycles on isolated Anvil, including requests.
These are local checks, not public testnet testing or a wallet-extension usability study.
The UI uses one chain per build and depends on its RPC for complete snapshots. Failed reads
must not be displayed as zero balances. Shared option links validate factory membership.
