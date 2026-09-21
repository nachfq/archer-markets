# Archer Markets

Fully collateralized Stock Token options with an onchain bid/ask orderbook.
**One order = one option covering one token.** Crossing limits match automatically
at the resting price, oldest first. Hold, resell or exercise manually before expiration.
Buyers pay an immutable execution fee of 0.01 USDG + 0.10% of the executed premium,
with no fee on cancellation or exercise.

**Testnet release:** five V4 markets are live on Robinhood Chain Testnet (chain 46630)
for TSLA, AMD, AMZN, NFLX and PLTR against USDG. These contracts use test assets with
no monetary value. The [hosted testnet frontend](https://archer-markets.up.railway.app/)
runs on Railway; hosting the app does not change the repository's visibility.

- [Robinhood Chain Testnet release](docs/testnet-release.md)
- [How it works](docs/how-it-works.md)
- [Try it locally as maker and taker](docs/demo.md)
- [SDK reference](packages/sdk/README.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT License](LICENSE)
- [Research, security review and development history](docs/research/README.md)

Source: [nachfq/archer-markets](https://github.com/nachfq/archer-markets).
