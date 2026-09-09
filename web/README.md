# Stock Options Lab · frontend

English-language options dapp built with React, TypeScript, wagmi and viem on the existing Vite/vinext + Sites scaffold. The browser connects directly to the configured RPC and an injected EVM wallet; no application database or backend indexer is required.

From the repository root, follow the main README for contract dependencies and a local deployment. Then run `npm run dev:local` to select Anvil (chain 31337), or `npm run dev` to select Robinhood testnet (46630). `VITE_CHAIN_ID` is a build-time setting: restart the development server or rebuild when changing it.

`lib/generated/deployments.json` contains public network and contract metadata. `npm run abi` from the repository root generates `lib/generated/abis.ts`. Never place wallet private keys in frontend environment variables or source files.

A deployment with a null factory or token address displays an empty options chain and disables all contract interactions. The market loads the latest 100 factory-created contracts and provides an explicit “load previous” action. Both registry polling and factory creation events refresh the data. Shared `?option=0x…` links only enable transactions for contracts found in that configured factory's registry; an older option may require loading previous contracts.

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
and My positions shows purchased and written contracts. Resale is not supported.
