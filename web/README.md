# Archer Markets frontend

React/TypeScript on Vite/vinext, using wagmi, viem and the [SDK](../packages/sdk/README.md).

Follow the [local walkthrough](../docs/demo.md), then run `npm run dev:local` from the
repository root. `npm run dev` selects Robinhood Chain Testnet using the committed
V4 market configuration. Trading stays disabled for any market without a valid deployment.

`VITE_CHAIN_ID` selects the chain at build time; restart/rebuild after changing it.
`lib/generated/deployments.json` supplies public addresses. `npm run abi` updates the ABIs.

From the root: `npm test`, `npm run typecheck`, `npm --prefix web run lint`, `npm run build`.
The isolated `npm run test:acceptance` also runs Anvil and browser flows.

The scoped `miniflare → undici` override pins security patch `7.29.1` for
[GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v).
Remove it when the pinned Miniflare version itself requires a patched release.

Railway staging follows the `staging` branch; production follows `main`. Merge
frontend changes into `staging` by PR, then promote reviewed changes to `main` by PR.
