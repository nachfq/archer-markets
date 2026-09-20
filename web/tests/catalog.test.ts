import test from "node:test";
import assert from "node:assert/strict";
import { catalogAssets, curatedMarkets, marketCatalog } from "../lib/catalog.ts";
import type { Deployment } from "../lib/config.ts";
const token = { address: "0x1111111111111111111111111111111111111111", symbol: "STOCK", decimals: 18, isMock: true } as const;
const primary: Deployment = { chainId: 31337, name: "Local", rpcUrl: "http://127.0.0.1:8545", explorerUrl: "", factory: null, deploymentBlock: null, marketId: "primary", version: 4, underlying: token, quote: { ...token, address: "0x2222222222222222222222222222222222222222", symbol: "USD", decimals: 6 } };
const practice = { ...primary, marketId: "practice", underlying: { ...token, address: "0x3333333333333333333333333333333333333333" as const } };
test("owner catalog determines visibility and order without fabricating deployments", () => {
  const entries = ["primary", "practice"].map(id => marketCatalog[31337].find(m => m.marketId === id)!);
  assert.deepEqual(curatedMarkets([primary, practice], [entries[1], entries[0]]).map(m => m.marketId), ["practice", "primary"]);
  assert.deepEqual(curatedMarkets([primary, practice], [{ ...entries[0], visible: false }, entries[1]]), [practice]);
  assert.deepEqual(curatedMarkets([primary], [entries[1]]), []);
  assert.equal(curatedMarkets([primary], entries)[0].factory, null);
});
test("all curated assets are listed without balances, shared quotes deduplicate, symbols do not", () => {
  const assets = catalogAssets([primary, practice]);
  assert.equal(assets.length, 3);
  assert.equal(assets.filter(a => a.presentation.kind === "stock").length, 2);
  assert.equal(assets.filter(a => a.presentation.kind === "stablecoin").length, 1);
  assert.notEqual(assets[0].key, assets[2].key);
});
test("unknown addresses and distinct chains never collapse into a known asset", () => {
  assert.equal(catalogAssets([primary, { ...primary, chainId: 46630 }]).length, 4);
  assert.equal(catalogAssets([{ ...primary, quote: { ...primary.quote, address: null } }, { ...practice, quote: { ...primary.quote, address: null } }]).length, 4);
});
