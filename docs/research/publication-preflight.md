# Repository publication preflight

Updated September 20, 2026. This record covers preparation for a future visibility
change. It does not state that the repository, contracts or V4 frontend are public.

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
  assets. V1–V3 contracts, SDK paths and acceptance tests remain because existing
  positions retain their original management behavior.
- Added contributor and security guidance and pinned GitHub Actions to reviewed commit
  SHAs.
- Re-ran 162 automated tests, type checking, lint, production build, dependency audits,
  V4 acceptance and legacy acceptance after cleanup. The optional Robinhood RPC-fork
  test remained skipped and no public transaction was sent.

## Final visibility checkpoint

Before changing visibility:

1. Choose an explicit source license, or intentionally publish without granting a
   reuse license. This is a human legal/product decision.
2. Move or delete the remote archive and feature branches. A public repository makes
   every remote branch visible; the archive is currently kept only while the repository
   is private.
3. Confirm that the release notes, repository description and test-only limitations
   still match the selected revision.
4. Change visibility only with explicit human approval, enable GitHub private
   vulnerability reporting, then test a fresh anonymous clone, relative links,
   documented commands and release access.

Robinhood Chain deployment, a transaction-enabled hosted frontend and hackathon
submission remain separate later phases.
