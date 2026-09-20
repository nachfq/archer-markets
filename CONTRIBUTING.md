# Contributing

Archer Markets is a testnet-only proof of concept. Read [How it works](docs/how-it-works.md)
before changing protocol behavior and follow the product boundary in [AGENTS.md](AGENTS.md).

## Local checks

Requirements are Node.js 22.13 or newer and Docker. Foundry is run through the
repository scripts; do not install a host Foundry toolchain for this project.

```sh
npm ci
npm --prefix web ci
npm run contracts:deps
npm test
npm run typecheck
npm --prefix web run lint
npm run build
npm run test:acceptance:v4
npm run test:acceptance
```

Contract changes must regenerate committed ABIs with `npm run abi` and pass the
isolated acceptance suites. Do not commit deployment manifests, generated evidence,
private keys or `.env` files.

## Scope

Keep V4 fully collateralized, oracle-free and physically settled. One order covers
one Stock Token and can match at most one independent option at the resting price.
Partial fills, batches, margin, AMMs, centralized matching, automatic exercise and
mainnet deployment require a separate product decision.

Document material implementation work and limitations in
[`docs/research/implementation.md`](docs/research/implementation.md). A review is not
an audit or evidence of public deployment.
