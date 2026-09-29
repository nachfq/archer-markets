---
title: Overview
---
# Stock Token options, onchain

Archer Markets lets you write, buy and resell fully collateralized options on
Robinhood Chain Testnet. Each option covers **one Stock Token** and is an independent
smart contract holding the asset its writer must deliver.

The holder decides when to exercise before expiration. There is no automatic
exercise and no cash settlement based on a price feed.

## Start here

- [How it works](how-it-works.md): trading, collateral, fees and exercise.
- [Use the testnet](testnet-release.md): network, faucets, contract addresses and
  public transaction evidence.
- [Run locally](demo.md): a two-wallet walkthrough with Anvil and mock assets.

## Build with Archer

The [TypeScript SDK](https://github.com/nachfq/archer-markets/blob/main/packages/sdk/README.md)
reads markets and prepares transactions; your wallet signs them.
See [Contributing](https://github.com/nachfq/archer-markets/blob/main/CONTRIBUTING.md)
for setup and validation commands.

The current release is V4 only. It is a testnet proof of concept, not an audited
product for real funds.
