# Implementation record

Earlier entries are preserved in the
[pre-cleanup Git snapshot](https://github.com/nachfq/archer-markets/blob/1f725fce813dadcf7b8f2c3934f2d6e15727517f/docs/research/implementation.md).
Historical results apply only to their recorded scope and date.

## Repository cleanup and documentation site (2026-09-29)

Removed obsolete research, completed planning and legacy-version documents from
the working tree with the coordinator's explicit approval, retaining their exact
Git history. Kept current product instructions, the local walkthrough, public
testnet release evidence and SDK reference. No runtime, contract, ABI, balance,
permission or deployment-manifest changes are included.

Added a small static Jekyll documentation site and a GitHub Pages workflow. The
public site excludes research/history and has no wallet, signer, analytics or
application backend. Pull requests build and check the site; only `main` can deploy.
The README links to the documentation entry point instead of listing each document.
Updated stale repository/privacy notes and frontend setup wording.

This branch starts from `origin/main` in an isolated checkout. Existing uncommitted
video scripts, media and workspace changes are untouched and are not part of this PR.

Validation: `npm test` passed (81 tests; one optional RPC-fork test skipped),
`npm run typecheck`, frontend lint and `npm run build` passed. Regenerated ABIs
are unchanged. The same Jekyll image used by CI built successfully; the artifact
check passed for four pages and 45 internal references, with no extra files.
All 22 relative Markdown links in the remaining 13 Markdown files resolve.
Desktop (1440 px) and mobile (390 px) browser checks passed on all four pages:
no document overflow, missing assets or browser errors, and exactly one active
navigation item. The initial missing home navigation state was corrected and
retested. The documentation has no client-side JavaScript.

Initial dependency audit limitation: the unchanged `main` web lockfile reported one moderate
`undici` WebSocket advisory, propagated through four packages in the Cloudflare
development-tool chain (GHSA-3wwx-pv8p-q78v). The existing CI audit threshold failed.
The initial cleanup commit did not include dependency changes; the coordinator
subsequently authorized the targeted correction below. No audit exception or CI
bypass is used.

GitHub Pages was enabled with `build_type=workflow` and HTTPS at
https://nachfq.github.io/archer-markets/. No documentation deployment has run;
the first publication is gated on merging this PR to `main`.

## Targeted dependency security fix (2026-09-29)

The coordinator authorized fixing the failing dependency audit in the same PR.
GHSA-3wwx-pv8p-q78v entered the GitHub Advisory Database on September 28, 2026,
after earlier checks had passed; the upstream advisory was published September 4.
This explains a newly failing audit without a changed application lockfile.

Pinned only Miniflare's `undici` dependency from `7.29.0` to patched `7.29.1`
through a scoped npm override. The pinned Miniflare release requires exactly
`7.29.0`, so a lockfile-only update would not satisfy it. The change avoids unrelated
Cloudflare/Miniflare upgrades and documents when the override can be removed.
The lockfile changes only that package's version, URL and integrity hash.
No application source, contracts, chain configuration or audit threshold changed.

A clean `npm --prefix web ci` installs `undici@7.29.1`; root and frontend audits
report zero vulnerabilities. `npm test` passed (81 tests, optional RPC fork skipped),
as did type checking, frontend lint, production build and the seven isolated browser
scenarios. Generated ABIs remain unchanged. The complete acceptance and audit gates
remain enabled in CI; no failing check is suppressed.
