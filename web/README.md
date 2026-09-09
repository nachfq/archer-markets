# Stock Options Lab · frontend

English-language options dapp built with React, TypeScript, wagmi and viem on the existing Vite/vinext + Sites scaffold. The browser connects directly to the configured RPC and an injected EVM wallet; no application database or backend indexer is required.

From the repository root, follow the main README for contract dependencies and a local deployment. Then run `npm run dev:local` to select Anvil (chain 31337), or `npm run dev` to select Robinhood testnet (46630). `VITE_CHAIN_ID` is a build-time setting: restart the development server or rebuild when changing it.

`lib/generated/deployments.json` contains public network and contract metadata. `npm run abi` exports ABIs into the SDK and generates `lib/generated/abis.ts` as a re-export. Build the SDK with `npm run sdk:build` before building the web. Never place wallet private keys in frontend environment variables or source files.

A deployment with a null factory or token address displays an empty options chain and disables all contract interactions. The SDK reads the complete registry at one block. Writer filters and the chain use the complete registry snapshot; three dates and five strikes are shown initially, with expansion for additional listings. Both registry polling and factory creation events refresh the data. Shared `?market=primary&option=0x…` links only enable transactions for contracts found in that market’s factory registry. Older positions can be opened without loading more chain rows.

Each offer has one writer and one buyer, a full fixed token lot, a total exercise amount and a total premium. Token amounts use integer base units; the UI never substitutes stock-share equivalents. Approval transactions are for the required amount, followed by simulation and the operation itself. Exercise is manual and physically exchanges the two ERC-20 tokens. Expired collateral is reclaimed manually by the writer.

Validation inside `web/`:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The unit tests cover lossless fractional token inputs, rejection of excess precision, expiration boundaries and ownership-sensitive action availability. End-to-end contract smoke tests live at the repository root. No browser wallet interaction is automated by these unit tests.

The default trading workspace groups actual open offers by exact expiration timestamp
and per-token strike, with calls and puts side by side. Three dates and five strikes
are shown initially; more can be expanded. The ticket preserves whole-lot totals,
and Portfolio shows purchased and written contracts across configured markets. Resale is not supported.

The light theme targets occasional investors: total premium and lot size are the
primary quote labels; per-token premium is secondary, and strike remains per token.
The review panel separates **You pay now**, **Your right**, and **Exercise before**.
Technical information lives under **Contract details**, while manual exercise and
no-resale conditions remain visible before purchase. Mobile uses a call/put selector
and a dedicated review view with focus restoration. All number grouping is display-only
and preserves the complete stored precision.


The creation form accepts per-token strike and premium and previews exact totals,
available collateral, committed collateral, reclaimable tokens and the post-deposit
balance. The account overview exposes funds directly. Activity records browser-originated
transactions with persistent receipt tracking. The SDK is the integration boundary for
reads and writes; wagmi provides wallet connection and signing only. Adding a supported
market uses the manifest’s `markets` entries, not new financial logic in React.

The frontend remains configured for a single chain per build. Multi-chain simultaneous
portfolio valuation and a production indexer are future work. Official-token integration
and the separately labeled sandbox remain test-only. The hosted deployment is not updated
until the public deployment manifest has been validated.
