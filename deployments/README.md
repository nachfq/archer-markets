# Deployment records

Deployment scripts write `<chainId>.json` here, including addresses, receipts and the
deployment block. Files are ignored because local chains are disposable. The
browser manifest is exported to `web/lib/generated/deployments.json` and contains
only public chain configuration. A missing deployment is represented by `null`,
never by a fabricated contract address.

`local-smoke.json` records actual local transaction evidence. It is not evidence
of public testnet execution. Verification and testnet demo records are written
only after the corresponding transactions/checks succeed.
