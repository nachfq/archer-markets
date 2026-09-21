# Robinhood Chain Testnet release

Archer Markets V4 is deployed on Robinhood Chain Testnet (chain ID `46630`). This is
a public testnet release using test assets with no monetary value. It is not a mainnet
release, an audit, or evidence of production readiness.

## Release configuration

- Network: Robinhood Chain Testnet
- RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`
- Quote token: USDG at `0x7E955252E15c84f5768B83c41a71F9eba181802F`
- Option size: exactly one Stock Token
- Exercise: manual American exercise with physical Stock Token delivery
- Matching: onchain price/time priority with at most one full match per order
- Buyer execution fee: `0.01 USDG + 10 bps` of executed premium
- Fee recipient: `0x20c81Db8F27F31fd39B5b23C1F38AD49CdBcA4E0`
- Deployment account: `0x0297E58AebF9c7bDBb83959EaB1306E8AE2147FF`

The fee configuration is immutable. Creating or cancelling an ask, cancelling a bid,
exercising, and reclaiming expired collateral do not pay a protocol fee.

## Deployed markets

| Pair | Market contract | Deployment transaction | Block |
| --- | --- | --- | ---: |
| TSLA / USDG | [`0xc8651e943aea1aeed398bd3beee7143475c6b40d`](https://explorer.testnet.chain.robinhood.com/address/0xc8651e943aea1aeed398bd3beee7143475c6b40d) | [`0x51b6...669f`](https://explorer.testnet.chain.robinhood.com/tx/0x51b6cbb4f070a1080398240df9def68c0b45036eb8f4c35ffc4232e6097d669f) | 122200158 |
| AMD / USDG | [`0xdb3d2f3e97b38c84ca313e9fdcc5c89859901bd3`](https://explorer.testnet.chain.robinhood.com/address/0xdb3d2f3e97b38c84ca313e9fdcc5c89859901bd3) | [`0x22c3...6563`](https://explorer.testnet.chain.robinhood.com/tx/0x22c3146fb471062debfc2e970ed0ab6df29ba5d349edff0b6dfbd5ae64056563) | 122200168 |
| AMZN / USDG | [`0x51464d6e700d0b8476cbd94eeda3f4bd5bfbab55`](https://explorer.testnet.chain.robinhood.com/address/0x51464d6e700d0b8476cbd94eeda3f4bd5bfbab55) | [`0x15e0...2977`](https://explorer.testnet.chain.robinhood.com/tx/0x15e0e552736d9b8d40e7bdcf537b95519fa525b195171c591d3899a257422977) | 122200178 |
| NFLX / USDG | [`0x8d4c2d2ca3ac8ceec8e294f5d28e947b87240dd9`](https://explorer.testnet.chain.robinhood.com/address/0x8d4c2d2ca3ac8ceec8e294f5d28e947b87240dd9) | [`0x58f2...e3b2`](https://explorer.testnet.chain.robinhood.com/tx/0x58f2209080860d7f0585b7772d693afffec4260156812aaa9288a91f60b9e3b2) | 122200186 |
| PLTR / USDG | [`0x39e2a162874970e4ca133f473179a675658ce7a1`](https://explorer.testnet.chain.robinhood.com/address/0x39e2a162874970e4ca133f473179a675658ce7a1) | [`0x8eb2...83af`](https://explorer.testnet.chain.robinhood.com/tx/0x8eb27b461a7448f719ce04d84d55d58e7c1aa8f931984c7693d7474bac3f83af) | 122200199 |

Live RPC reads after deployment confirmed version 4, 24,018 runtime bytes, the intended
underlying and quote token for every market, and the exact fee configuration above.

## Public liquidity fixture

The disposable deployment account posted a small two-sided call market for every pair
and a two-sided PLTR put market. All 12 fixture orders expire on December 18, 2026 at
20:00 UTC. Their strikes and premiums are illustrative test values; they are not market
data, price recommendations, simulated users or evidence of demand.

| Pair | Series | Bid | Ask |
| --- | --- | ---: | ---: |
| TSLA / USDG | 50 call | 1 USDG | 2 USDG |
| AMD / USDG | 40 call | 1 USDG | 2 USDG |
| AMZN / USDG | 40 call | 1 USDG | 2 USDG |
| NFLX / USDG | 30 call | 1 USDG | 2 USDG |
| PLTR / USDG | 20 call | 1 USDG | 2 USDG |
| PLTR / USDG | 20 put | 1 USDG | 2 USDG |

The fixture begins with the
[`TSLA` bid](https://explorer.testnet.chain.robinhood.com/tx/0x634bddb496ce0c4dc7fd4dc8f231ad01c5d86262108e7682a8b9f137600f3073)
and ends with the
[`PLTR` put ask](https://explorer.testnet.chain.robinhood.com/tx/0x4565541954449f8888cd44c107fdc3a951a0da5c10e3e92dd6fa9f859726a7a4).
At block `122211653`, the five books contained 17 open orders in total: these 12
fixture orders plus five orders posted independently by the coordinator. No order had
executed or been cancelled, so this is public liquidity evidence rather than a completed
two-wallet lifecycle.

All five market contracts and representative call and put option instances are source
verified on the explorer. The verification record is generated locally and remains
ignored because it contains operational evidence, not frontend configuration.

## Hosted frontend

The testnet frontend is available at
[archer-markets.up.railway.app](https://archer-markets.up.railway.app/). It runs as one
small Node.js service on Railway using `vinext start`; it has no database, persistent
volume, backend signer or server-side private key. Wallet interactions remain in the
browser and transactions are sent directly to Robinhood Chain Testnet.

The Railway deployment was uploaded from the local workspace. Publishing the frontend
does not require making the source repository public.

## Test funds

- ETH and Stock Tokens: [Robinhood Chain Testnet faucet](https://faucet.testnet.chain.robinhood.com/)
- USDG: [Paxos Testnet Faucet](https://faucet.paxos.com/?network=robinhood)

In the Paxos faucet, select USDG and Robinhood Testnet, then enter the receiving test
wallet. Confirm that the token address is
`0x7E955252E15c84f5768B83c41a71F9eba181802F` before using it in Archer Markets.

## Validation and limitations

The release passed 81 contract, invariant, deployment-tool, SDK and frontend tests plus
type checking and a production frontend build. The optional RPC-fork test was skipped;
live post-deployment reads were executed independently against the public testnet RPC.

The contracts are not audited. Fixture liquidity is synthetic, manual exercise is
required, and the public RPC is rate-limited. No oracle settlement, AMM, centralized
matcher or mainnet configuration is included.
