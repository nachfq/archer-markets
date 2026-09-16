# Archer Markets frontend

React/TypeScript on Vite/vinext, using wagmi, viem and the [SDK](../packages/sdk/README.md).

Follow the [local walkthrough](../docs/demo.md), then run `npm run dev:local` from the
repository root. `npm run dev` selects Robinhood Chain Testnet, where trading is disabled
until a valid deployment is configured.

`VITE_CHAIN_ID` selects the chain at build time; restart/rebuild after changing it.
`lib/generated/deployments.json` supplies public addresses. `npm run abi` updates the ABIs.

From the root: `npm test`, `npm run typecheck`, `npm --prefix web run lint`, `npm run build`.
The isolated `npm run test:acceptance` also runs Anvil and browser flows.
