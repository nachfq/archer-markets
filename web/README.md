# Stock Options Lab · frontend

English-language options dapp built with React, TypeScript, wagmi and viem on the existing Vite/vinext + Sites scaffold. The browser connects directly to the configured RPC and an injected EVM wallet; no application database or backend indexer is required.

From the repository root, follow the main README for contract dependencies and a local deployment. Then run `npm run dev:local` to select Anvil (chain 31337), or `npm run dev` to select Robinhood testnet (46630). `VITE_CHAIN_ID` is a build-time setting: restart the development server or rebuild when changing it.

`lib/generated/deployments.json` contains public network and contract metadata. `npm run abi` exports ABIs into the SDK and generates `lib/generated/abis.ts` as a re-export. Build the SDK with `npm run sdk:build` before building the web. Never place wallet private keys in frontend environment variables or source files.

A deployment with a null factory or token address displays an empty options chain and disables all contract interactions. The SDK reads the complete registry at one block. Writer filters and the chain use the complete registry snapshot; the nearest expiration and five strikes are shown initially, with dropdowns for all expirations and 5, 10, or all strikes. Both registry polling and factory creation events refresh the data. Shared `?market=primary&option=0x…` links only enable transactions for contracts found in that market’s factory registry. Older positions can be opened without loading more chain rows.

Each offer has one writer and one buyer, a full fixed token lot, a total exercise amount and a total premium. Token amounts use integer base units; the UI never substitutes stock-share equivalents. Approval transactions are for the required amount, followed by simulation and the operation itself. Exercise is manual and physically exchanges the two ERC-20 tokens. Expired collateral is reclaimed manually by the writer.

Validation inside `web/`:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The unit tests cover lossless fractional token inputs, rejection of excess precision, expiration boundaries and ownership-sensitive action availability. End-to-end contract smoke tests live at the repository root. No browser wallet interaction is automated by these unit tests.

The dark trading workspace is organized into Trade, Portfolio, and Activity.
Trade has a Buy / Write dropdown. The chain groups actual open offers by exact
expiration timestamp and per-token strike, with calls and puts side by side.
Dropdowns select expiration, strike count, and ownership. Each compact offer shows
per-token premium, lot size, total premium, and a separate ownership indicator.
Own and other-writer offers remain distinct; additional quotes expand inline.

Selecting an offer opens a bottom review ticket with exact whole-lot costs,
exercise delivery, and deadline. Contract addresses, funding explanations and
calendar export live in Contract details. Manual exercise and no-resale conditions
remain visible. Mobile uses a call/put dropdown and a dedicated review view with
focus restoration. All number grouping is display-only and preserves stored precision.

Writing follows terms → Review offer → Deposit collateral & write option.
Reviewing alone never sends an approval or transaction. Changing terms clears review;
switching markets clears terms and selected positions. The review shows required
collateral, available and remaining balance, total premium, and exercise payment.
An unconfigured network supports a labeled terms preview but disables submission.

Portfolio uses a table with role-sensitive actions and status/type dropdowns.
Balances and collateral breakdowns are under Balances & collateral. The wallet menu
contains test faucets and disconnect. Activity is a browser-local transaction table
with persistent onchain receipt tracking. The SDK remains the read/write integration
boundary; wagmi supplies wallet connection and signing.

Additional local acceptance scripts are documented in `docs/demo.md`. The social
preview uses `public/og-workspace.png`; individual option links clear that root image.

The frontend remains configured for a single chain per build. Multi-chain simultaneous
portfolio valuation and a production indexer are future work. Official-token integration
and the separately labeled sandbox remain test-only. The hosted deployment is not updated
until the public deployment manifest has been validated.
