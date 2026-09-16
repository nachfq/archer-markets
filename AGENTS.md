# Repository coordination

This project is built by agents under human coordination. The current human product
decision is a fully collateralized options PoC on Robinhood Chain Testnet, with manual
American exercise and physical Stock Token delivery. V3 adds buyer-funded requests,
accepted only in full, with quantities in multiples of 0.1 token and one independent
option per agreement. No partial fills or automatic matching are in scope. Do not add mainnet, oracle-based
settlement, an AMM, or a different product vertical without a new product decision.

- Keep all repository content in English: documentation, UI copy, source comments,
  test descriptions, and durable agent instructions. Conversation with the human
  coordinator may remain in Spanish. Preserve technical identifiers and source URLs.
- Preserve research documents and distinguish hypotheses, simulations, executed tests,
  and public transactions. Never invent adoption, human validation, or deployment evidence.
- The hosted website is a frontend deployment. Its current chain-46630 configuration
  has no factory address; do not describe it as a funded contract demo. Local chain-31337
  deployments and synthetic-balance RPC forks are distinct forms of evidence.
- For parallel work, assign concrete file ownership before editing. Use ABIs and
  deployment manifests as the integration boundary between contracts, scripts, and UI.
- Never include private keys in source, frontend code, manifests, or logs. `.env` is
  local and ignored. Never use public Anvil development accounts on public networks.
- Changes to amounts, states, collateral, or permissions require conservation and
  rollback tests. Run `npm test`, `npm run typecheck`, and the build for implementation
  changes. Contract changes also require ABI regeneration and `npm run test:e2e` on
  Anvil. Documentation-only edits require checks for factual and command accuracy.
- Record contributions and limitations in `docs/research/implementation.md`. Review by another
  agent is neither an audit nor human approval.
- Pin dependencies and preserve explicit network configuration. Do not enable
  transactions when the manifest lacks a valid deployment.
- Keep platform documentation short and practical. Put development history, research,
  and planning in `docs/research/`; ask before deleting existing documents.
- Run Foundry tools through Docker using the repository scripts. Do not install or
  download native Foundry binaries onto the host or change the shell PATH for them.
- Reserve local Anvil accounts 0 and 1 for human demo use. The seed may grant them
  mock tokens, but must create all fixture options and requests using accounts 2–9.
