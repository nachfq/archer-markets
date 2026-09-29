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
npm run test:acceptance
```

Contract changes must regenerate committed ABIs with `npm run abi` and pass the
isolated V4 acceptance suite. Do not commit deployment manifests, generated evidence,
private keys or `.env` files.

## Scope

Keep V4 fully collateralized, oracle-free and physically settled. One order covers
one Stock Token and can match at most one independent option at the resting price.
Partial fills, batches, margin, AMMs, centralized matching, automatic exercise and
mainnet deployment require a separate product decision.

Document material implementation work and limitations in
[`docs/research/implementation.md`](docs/research/implementation.md). A review is not
an audit or evidence of public deployment.

## Documentation

Edit the Markdown pages in `docs/`; keep user instructions short and put development
notes in `docs/research/`. GitHub Pages builds the same Markdown, without copying
the research directory or maintaining a second set of product docs. The SDK reference
stays in `packages/sdk/README.md`.

The `Documentation` workflow checks each relevant PR and publishes only after a
merge to `main`. Repository **Settings → Pages → Source** must be **GitHub Actions**.
The site URL is https://nachfq.github.io/archer-markets/.

To build locally with the same image as CI, from the repository root:

```sh
docker run --rm --user "$(id -u):$(id -g)" \
  -e GITHUB_WORKSPACE=/workspace -e GITHUB_REPOSITORY=nachfq/archer-markets \
  -e INPUT_SOURCE=docs -e INPUT_DESTINATION=_site \
  -v "$PWD:/workspace" ghcr.io/actions/jekyll-build-pages:v1.0.13
node scripts/check-docs.mjs
```

Serve `_site/` under `/archer-markets/` to preview the project's GitHub Pages base path.
When adding a public page or asset, update `scripts/check-docs.mjs`'s explicit file
list and the navigation in `docs/_config.yml`. Keep generated output out of Git.
