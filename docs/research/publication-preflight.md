# Repository publication preflight

Updated September 20, 2026. This record covers preparation for a future repository
visibility change. The repository remains private; the contracts and V4 frontend are
already public testnet artifacts documented in the release record.

## Completed in the private repository

- Preserved the complete pre-cleanup development history on
  `archive/pre-publication-cleanup-2026-09-20` before removing obsolete tracked files.
- Kept `main` intentionally short: the initial commit and the squashed V4 release
  candidate, followed by publication-preparation changes.
- Reviewed tracked files and every reachable Git ref for credential-like names,
  private-key markers and 32-byte hexadecimal literals. Matches were empty environment
  variables, test placeholders and documented local transaction hashes. Gitleaks
  `v8.30.1` also scanned 23 reachable commits and reported no leaks. These checks are
  not a general security audit.
- Confirmed that `.env`, deployment evidence, build outputs, Foundry dependencies and
  acceptance directories are ignored. The local `.env` was not read or modified.
- Removed unused visual-review scripts, unused UI primitives and superseded image
  assets. A later V4-only cleanup removed V1–V3 contracts, SDK paths and acceptance
  tests from the active tree; their dated research records remain archived here.
- Added contributor and security guidance and pinned GitHub Actions to reviewed commit
  SHAs.
- Added the MIT License selected by the human coordinator and aligned package metadata.
- The validation results for the later V4-only cleanup are recorded in
  [the implementation record](implementation.md). No public transaction was sent.

## Final visibility checkpoint

Before changing visibility:

1. Move or delete the remote archive and feature branches. A public repository makes
   every remote branch visible; the archive is currently kept only while the repository
   is private.
2. Confirm that the release notes, repository description and test-only limitations
   still match the selected revision.
3. Change visibility only with explicit human approval, enable GitHub private
   vulnerability reporting, then test a fresh anonymous clone, relative links,
   documented commands and release access.

Robinhood Chain deployment, source verification and the transaction-enabled hosted
frontend are complete. Repository visibility and the hackathon submission remain
separate later phases.
