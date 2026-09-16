# Solidity and Stylus assessment

Reviewed on September 9, 2026. This is a technical assessment, not a migration or
performance claim. The original PoC used Solidity without a Solidity-versus-Stylus
benchmark for its options implementation.

## Recommendation for the current PoC

Keep the existing Solidity factory and options as the baseline. The core operations
are collateral transfers, token balance checks, approvals, and a small state machine.
They contain little computationally expensive arithmetic. Arbitrum documents that
Stylus's largest savings concern computation and memory, while persistent storage
uses the same underlying EVM costs. No workload-specific gas savings have been measured
for this repository. [Arbitrum gas guidance](https://docs.arbitrum.io/stylus/best-practices/gas-optimization).

Stylus is a plausible fit for a future shared pricing or portfolio-risk module if
the product actually needs those calculations onchain. A browser-only quote display
does not by itself require an onchain pricing engine. Solidity custody contracts can
call ABI-compatible Stylus contracts; an eventual experiment need not rewrite the
existing collateral lifecycle. [Stylus overview](https://docs.arbitrum.io/stylus/gentle-introduction).

## Robinhood network observations

The public RPCs returned the following at the observed blocks:

| Network | Chain ID | Block | `ArbWasm.stylusVersion()` | `ArbWasmCache.allCacheManagers()` |
|---|---:|---:|---:|---|
| Robinhood Chain Testnet | 46630 | 116306019 | 3 | `[]` |
| Robinhood Chain Mainnet | 4663 | 58648114 | 3 | `[]` |

Follow-up reads reported `maxStackDepth = 22000` and `inkPrice = 10000` on both
networks. These are direct protocol capability observations, not proof that this
project has deployed or benchmarked a Rust contract.

`ArbWasm` is at `0x0000000000000000000000000000000000000071` and
`ArbWasmCache` is at `0x0000000000000000000000000000000000000072`.
Interfaces were checked against the official precompile references and the locally
installed Offchain Labs Stylus tooling. [Precompile reference](https://docs.arbitrum.io/arbitrum-essentials/precompiles/reference).

**No CacheManager was registered at those blocks.** This means the standard developer
bidding route has no registered manager to target. It does not prove that no contract
named CacheManager was ever deployed, that the chain owner never cached any code,
or that Stylus cannot execute uncached programs. `cargo stylus cache status` also
reported that no cache managers were found on the testnet.

CacheManager manages compiled program code and reduces initialization overhead;
it does not cache option prices or collateral state. An activated program can execute
without being in that cache, at a different initialization cost. Activation and caching
are distinct. Code caching is keyed by code hash, allowing identical program code to
share a cache entry. [Caching documentation](https://docs.arbitrum.io/stylus/how-tos/caching-contracts),
[CacheManager source](https://github.com/OffchainLabs/nitro-contracts/blob/main/src/chain/CacheManager.sol).

## Reproduce the read-only checks

```sh
npm run check:stylus
npm run check:stylus -- mainnet
```

Neither command uses a signing key nor sends transactions. Each prints its own block
number so future changes in registration are visible. A raw check is also possible:

```sh
cast call 0x0000000000000000000000000000000000000072 \
  'allCacheManagers()(address[])' \
  --rpc-url https://rpc.testnet.chain.robinhood.com
```

## What would justify a Stylus experiment?

Compare the same functionality and token interactions on a Stylus-enabled local
Nitro node before changing the implementation. Measure deployment and activation,
first and repeated calls, uncached initialization, storage, and ERC-20 calls. Test
cached behavior only where a manager is actually available; report any local cache
configuration separately from Robinhood's observed configuration.

Ordinary Anvil tests in this repository exercise the EVM Solidity code. They are not
a Stylus execution or gas benchmark. Use a Stylus-enabled dev node for mixed EVM/WASM
integration, and retain the existing balance-conservation and authorization tests.

For a factory design, avoid assuming every instance needs unique WASM code or a
separate cache entry: terms can be stored as instance state with shared program code.
Any benefit must be measured against that design's storage and activation costs.
