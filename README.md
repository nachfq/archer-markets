# Archer Markets

Fully collateralized Stock Token options with an onchain bid/ask orderbook.
**One order = one option covering one token.** Crossing limits match automatically
at the resting price, oldest first. Hold, resell or exercise manually before expiration.
Buyers pay an immutable execution fee; the current deployment plan uses 0.01 USDG
+ 0.10% of the executed premium, with no fee on cancellation or exercise.

**Local PoC:** works with mock assets on Anvil. Robinhood Chain Testnet is the target;
the hosted frontend has no configured protocol deployment. Test funds only.

- [How it works](docs/how-it-works.md)
- [Try it locally as maker and taker](docs/demo.md)
- [SDK reference](packages/sdk/README.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT License](LICENSE)
- [Research, security review and development history](docs/research/README.md)

Source: [nachfq/archer-markets](https://github.com/nachfq/archer-markets).
