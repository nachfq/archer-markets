# Security policy

Archer Markets is an unaudited, testnet-only proof of concept. Do not use it with
real assets or treat the repository, hosted frontend, simulations or local acceptance
evidence as a production security guarantee.

Report suspected vulnerabilities directly to the repository owner through a private
channel. GitHub private vulnerability reporting is not currently enabled. If you
have no private contact, open an issue requesting one without technical details.
Do not publish secrets, private keys, exploit details or affected wallet data in an
issue. Non-sensitive correctness reports may use the issue tracker.

## Scope and limitations

- V4 supports fully collateralized options, manual exercise and physical token
  delivery. Exercise and recovery transactions must be submitted by the user.
- Supported tokens must transfer exact amounts and must not rebase. Token freezes,
  upgrades or changed transfer rules can prevent exercise or recovery.
- The public RPC, wallet and network must remain available. A pending transaction
  does not reserve an execution time before expiration.
- Testnet fixtures and automated tests do not establish real-money safety, demand
  or resistance to sustained public traffic.

See the [testnet release and limitations](docs/testnet-release.md). Historical
reviews are preserved in [Git](docs/research/README.md), not presented as a V4 audit.
