"use client";

import Link from "next/link";
import OptionsChain from "./options-chain";
import { useEffect, useState, type FormEvent } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  WagmiProvider,
  useConnection,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { BaseError, isAddress, type Address, type Hash } from "viem";
import {
  chain,
  client,
  config,
  deployment as net,
  ready,
  type Token,
} from "../lib/config";
import {
  erc20Abi,
  faucetAbi,
  optionAbi,
  optionFactoryAbi,
} from "../lib/generated/abis";
import {
  actions,
  amount,
  expiration,
  short,
  status,
  units,
  type Position,
} from "../lib/options";
import { deadlinePreview, suggestedExpirations, utcDeadline } from "../lib/expirations";

const actionNames: Record<string, string> = {
  buy: "Buy option",
  exercise: "Exercise option",
  cancel: "Cancel offer",
  reclaimExpired: "Reclaim collateral",
};
const remaining = (end: bigint, now: bigint) => {
  const seconds = Number(end > now ? end - now : 0n);
  return seconds === 0
    ? "Expired"
    : seconds >= 86400
      ? `${Math.floor(seconds / 86400)} d ${Math.floor((seconds % 86400) / 3600)} h remaining`
      : seconds >= 3600
        ? `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min remaining`
        : `${Math.floor(seconds / 60)} min ${seconds % 60} s remaining`;
};
const errorText = (error: unknown) =>
  error instanceof BaseError
    ? error.shortMessage
    : error instanceof Error
      ? error.message
      : "The operation could not be completed.";

async function readPosition(address: Address): Promise<Position> {
  const [
    writer,
    buyer,
    underlyingAmount,
    strikeTotal,
    premium,
    expiry,
    optionType,
    state,
  ] = await Promise.all([
    client.readContract({ address, abi: optionAbi, functionName: "writer" }),
    client.readContract({ address, abi: optionAbi, functionName: "buyer" }),
    client.readContract({
      address,
      abi: optionAbi,
      functionName: "underlyingAmount",
    }),
    client.readContract({
      address,
      abi: optionAbi,
      functionName: "strikeTotal",
    }),
    client.readContract({ address, abi: optionAbi, functionName: "premium" }),
    client.readContract({ address, abi: optionAbi, functionName: "expiry" }),
    client.readContract({
      address,
      abi: optionAbi,
      functionName: "optionType",
    }),
    client.readContract({ address, abi: optionAbi, functionName: "state" }),
  ]);
  return {
    address,
    writer,
    buyer,
    underlyingAmount,
    strikeTotal,
    premium,
    expiry,
    optionType,
    state,
  };
}

function App() {
  const { address, chainId, isConnected } = useConnection();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const cache = useQueryClient();
  const [tab, setTab] = useState<"market" | "create" | "mine">("market");
  const [filter, setFilter] = useState<"all" | "call" | "put">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [kind, setKind] = useState(0);
  const [quantity, setQuantity] = useState("");
  const [strike, setStrike] = useState("");
  const [premium, setPremium] = useState("");
  const [expiry, setExpiry] = useState("");
  const [expiryMode, setExpiryMode] = useState<"suggested" | "custom">("suggested");
  const [presetExpiry, setPresetExpiry] = useState("");
  const [acceptedFor, setAcceptedFor] = useState("");
  const expirySuggestions = suggestedExpirations(clock);
  const effectiveExpiry = expiryMode === "custom" ? expiry : presetExpiry || expirySuggestions[0]?.value || "";
  const wrongChain = isConnected && chainId !== chain.id;
  const health = useQuery({
    queryKey: ["deployment-health", chain.id, net.factory],
    enabled: ready,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async () => {
      const [rpcChain, code, underlying, quote, stockDecimals, quoteDecimals] =
        await Promise.all([
          client.getChainId(),
          client.getCode({ address: net.factory! }),
          client.readContract({
            address: net.factory!,
            abi: optionFactoryAbi,
            functionName: "underlying",
          }),
          client.readContract({
            address: net.factory!,
            abi: optionFactoryAbi,
            functionName: "quote",
          }),
          client.readContract({
            address: net.underlying.address!,
            abi: erc20Abi,
            functionName: "decimals",
          }),
          client.readContract({
            address: net.quote.address!,
            abi: erc20Abi,
            functionName: "decimals",
          }),
        ]);
      if (
        rpcChain !== chain.id ||
        !code ||
        code === "0x" ||
        underlying.toLowerCase() !== net.underlying.address!.toLowerCase() ||
        quote.toLowerCase() !== net.quote.address!.toLowerCase() ||
        stockDecimals !== net.underlying.decimals ||
        quoteDecimals !== net.quote.decimals
      ) {
        throw new Error(
          "The deployment does not match this network configuration.",
        );
      }
      return true;
    },
  });
  const canAct =
    ready && health.isSuccess && isConnected && !wrongChain && !busy;

  useEffect(() => {
    const sync = () =>
      setSelected(new URL(window.location.href).searchParams.get("option"));
    sync();
    const timer = setInterval(() => setClock(Date.now()), 1000);
    window.addEventListener("popstate", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  useEffect(() => {
    if (!net.factory) return;
    return client.watchContractEvent({
      address: net.factory,
      abi: optionFactoryAbi,
      eventName: "OptionCreated",
      pollingInterval: 12_000,
      onLogs: () => {
        void cache.invalidateQueries({ queryKey: ["market"] });
      },
      onError: () => {
        /* Periodic registry reads remain available when filters are unsupported. */
      },
    });
  }, [cache]);

  const market = useQuery({
    queryKey: ["market", chain.id, limit],
    enabled: ready && health.isSuccess,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: async () => {
      const factory = net.factory!;
      const [total, block] = await Promise.all([
        client.readContract({
          address: factory,
          abi: optionFactoryAbi,
          functionName: "optionCount",
        }),
        client.getBlock(),
      ]);
      const count = Number(total > BigInt(limit) ? BigInt(limit) : total);
      const positions: Position[] = [];
      for (let offset = 0; offset < count; offset += 5) {
        const batch = Array.from(
          { length: Math.min(5, count - offset) },
          (_, i) => total - 1n - BigInt(offset + i),
        );
        const addresses = await Promise.all(
          batch.map((index) =>
            client.readContract({
              address: factory,
              abi: optionFactoryAbi,
              functionName: "options",
              args: [index],
            }),
          ),
        );
        positions.push(...(await Promise.all(addresses.map(readPosition))));
      }
      return {
        total,
        positions,
        timestamp: block.timestamp,
        loadedAt: Date.now(),
      };
    },
  });
  const balances = useQuery({
    queryKey: ["balances", chain.id, address],
    enabled: ready && health.isSuccess && !!address,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [underlying, quote, gas] = await Promise.all([
        client.readContract({
          address: net.underlying.address!,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address!],
        }),
        client.readContract({
          address: net.quote.address!,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address!],
        }),
        client.getBalance({ address: address! }),
      ]);
      return { underlying, quote, gas };
    },
  });
  const now = market.data
    ? market.data.timestamp +
      BigInt(Math.max(0, Math.floor((clock - market.data.loadedAt) / 1000)))
    : BigInt(Math.floor(clock / 1000));
  const positions = market.data?.positions ?? [];
  const detail =
    selected && isAddress(selected)
      ? positions.find(
          (p) => p.address.toLowerCase() === selected.toLowerCase(),
        )
      : undefined;
  const visible = positions.filter(
    (p) =>
      (filter === "all" || p.optionType === (filter === "call" ? 0 : 1)) &&
      (tab === "mine"
        ? !!address &&
          [p.writer, p.buyer].some(
            (a) => a.toLowerCase() === address.toLowerCase(),
          )
        : p.state === 0 && p.expiry > now),
  );

  function openDetail(option: string | null) {
    const url = new URL(window.location.href);
    if (option) url.searchParams.set("option", option);
    else url.searchParams.delete("option");
    window.history.pushState({}, "", url);
    setSelected(option);
    setAcceptedFor("");
  }
  async function walletConnect() {
    setError("");
    try {
      if (!connectors[0])
        throw new Error("Install an EVM wallet in this browser to connect.");
      await connectAsync({ connector: connectors[0] });
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function switchNetwork() {
    try {
      await switchChainAsync({ chainId: chain.id });
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function receipt(hash: Hash) {
    setTxHash(hash);
    setNotice("Transaction sent. Waiting for confirmation…");
    const result = await client.waitForTransactionReceipt({ hash });
    if (result.status !== "success")
      throw new Error(
        "The transaction reverted. Check your balance, approvals, and expiration.",
      );
  }
  async function approve(token: Token, spender: Address, value: bigint) {
    const allowance = await client.readContract({
      address: token.address!,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address!, spender],
    });
    if (allowance >= value) return;
    setNotice(
      `Approval step: authorize ${units(value, token.decimals)} ${token.symbol} in your wallet.`,
    );
    const { request } = await client.simulateContract({
      address: token.address!,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, value],
      account: address!,
    });
    await receipt(await writeContractAsync({ ...request, chainId: chain.id }));
  }
  async function run(task: () => Promise<void>, success: string) {
    if (!canAct) {
      setError("Connect your wallet to the selected network to continue.");
      return;
    }
    setBusy(true);
    setError("");
    setTxHash(null);
    setNotice("Preparing transaction…");
    try {
      await task();
      setNotice(success);
      await cache.invalidateQueries();
    } catch (err) {
      setNotice("");
      setError(errorText(err));
      await cache.invalidateQueries();
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const q = amount(quantity, net.underlying.decimals),
        k = amount(strike, net.quote.decimals),
        p = amount(premium, net.quote.decimals);
      const block = await client.getBlock();
      const e = expiration(effectiveExpiry, Number(block.timestamp) * 1000);
      await approve(
        kind === 0 ? net.underlying : net.quote,
        net.factory!,
        kind === 0 ? q : k,
      );
      setNotice("Confirm offer creation and the collateral deposit.");
      const { request } = await client.simulateContract({
        address: net.factory!,
        abi: optionFactoryAbi,
        functionName: "createOption",
        args: [kind, q, k, p, e],
        account: address!,
      });
      await receipt(
        await writeContractAsync({ ...request, chainId: chain.id }),
      );
      setTab("mine");
      setQuantity("");
      setStrike("");
      setPremium("");
      setExpiry("");
      setPresetExpiry("");
    }, "Offer created. Collateral has been deposited in the contract.");
  }
  async function transact(position: Position, action: string) {
    await run(async () => {
      if (action === "buy" && acceptedFor !== `${address}:${position.address}`)
        throw new Error("Confirm that you understand the manual exercise deadline before buying.");
      if (action === "buy")
        await approve(net.quote, position.address, position.premium);
      if (action === "exercise")
        await approve(
          position.optionType === 0 ? net.quote : net.underlying,
          position.address,
          position.optionType === 0
            ? position.strikeTotal
            : position.underlyingAmount,
        );
      setNotice("Confirm the transaction in your wallet.");
      const { request } = await client.simulateContract({
        address: position.address,
        abi: optionAbi,
        functionName: action as
          | "buy"
          | "exercise"
          | "cancel"
          | "reclaimExpired",
        account: address!,
      });
      await receipt(
        await writeContractAsync({ ...request, chainId: chain.id }),
      );
    }, "Transaction confirmed. Balances and position are up to date.");
  }
  async function faucet(token: Token) {
    await run(async () => {
      setNotice(`Request test ${token.symbol} in your wallet.`);
      const { request } = await client.simulateContract({
        address: token.address!,
        abi: faucetAbi,
        functionName: "faucet",
        account: address!,
      });
      await receipt(
        await writeContractAsync({ ...request, chainId: chain.id }),
      );
    }, `Test ${token.symbol} received.`);
  }
  const displayAmount = (value: bigint, token: Token) =>
    `${units(value, token.decimals)} ${token.symbol}`;
  const explorer = (path: string, text: string) =>
    net.explorerUrl ? (
      <a target="_blank" rel="noreferrer" href={`${net.explorerUrl}/${path}`}>
        {text} ↗
      </a>
    ) : (
      <span>{text}</span>
    );

  const detailPanel = (
          <div className="detail">
            <button className="text-button" onClick={() => openDetail(null)}>
              ← Back to offers
            </button>
            {detail ? (
              <>
                <div className="section-head">
                  <div>
                    <div className="eyebrow">INDIVIDUAL CONTRACT</div>
                    <h2>
                      {detail.optionType === 0
                        ? "Covered call"
                        : "Collateralized put"}{" "}
                      · {net.underlying.symbol}
                    </h2>
                  </div>
                  <span className="pill">{status(detail, now)}</span>
                </div>
                <div className="terms">
                  <div>
                    <span>Lot size</span>
                    <strong>
                      {displayAmount(detail.underlyingAmount, net.underlying)}
                    </strong>
                  </div>
                  <div>
                    <span>Total premium · paid when buying</span>
                    <strong>{displayAmount(detail.premium, net.quote)}</strong>
                  </div>
                  <div>
                    <span>Total exercise amount</span>
                    <strong>
                      {displayAmount(detail.strikeTotal, net.quote)}
                    </strong>
                  </div>
                  <div>
                    <span>
                      Exercise deadline · {remaining(detail.expiry, now)} (estimated)
                    </span>
                    <strong>
                      {utcDeadline(detail.expiry)}
                    </strong>
                    <small className="fine">Your local time: {new Date(Number(detail.expiry) * 1000).toLocaleString("en-US", { timeZoneName: "short" })}</small>
                  </div>
                </div>
                {detail.state < 2 && (
                  <div className={`deadline-notice ${detail.expiry <= now || detail.expiry - now < 86400n ? "urgent" : ""}`} role="note">
                    <strong>{detail.expiry <= now ? "Exercise is no longer available" : "Manual exercise · before expiration"}</strong>
                    <p>{detail.expiry <= now
                      ? "The exercise deadline has passed. The buyer can no longer exercise, even if the collateral is still in the contract. The writer may reclaim it and keeps any premium paid."
                      : "You must exercise before the deadline, even if the option is profitable. There is no automatic exercise or payout. If you miss it, the right expires, the premium is not refunded, and the writer can reclaim the collateral."}</p>
                    {detail.expiry > now && <p>Allow time for approvals and transaction inclusion. A signed or pending transaction does not reserve your right to exercise.</p>}
                  </div>
                )}
                <div className="delivery">
                  <strong>
                    When exercising this{" "}
                    {detail.optionType === 0 ? "call" : "put"}
                  </strong>
                  <p>
                    You deliver{" "}
                    {detail.optionType === 0
                      ? displayAmount(detail.strikeTotal, net.quote)
                      : displayAmount(
                          detail.underlyingAmount,
                          net.underlying,
                        )}{" "}
                    and receive{" "}
                    {detail.optionType === 0
                      ? displayAmount(detail.underlyingAmount, net.underlying)
                      : displayAmount(detail.strikeTotal, net.quote)}
                    . The exchange happens in a single transaction.
                  </p>
                </div>
                <p className="fine">
                  Contract{" "}
                  {explorer(`address/${detail.address}`, short(detail.address))}{" "}
                  · Writer {short(detail.writer)}
                  {detail.state !== 0 &&
                  detail.buyer !== "0x0000000000000000000000000000000000000000"
                    ? ` · Buyer ${short(detail.buyer)}`
                    : ""}
                </p>
                {actions(detail, address, now).includes("buy") && (
                  <label className="exercise-ack">
                    <input type="checkbox" checked={acceptedFor === `${address}:${detail.address}`} disabled={busy}
                      onChange={(event) => setAcceptedFor(event.target.checked ? `${address}:${detail.address}` : "")} />
                    <span>I understand that I must exercise before {utcDeadline(detail.expiry)} and that an unexercised option expires without a payout or premium refund.</span>
                  </label>
                )}
                <div className="detail-actions">
                  {actions(detail, address, now).map((action) => (
                    <button
                      className="button dark"
                      key={action}
                      disabled={!canAct || market.isError || (action === "buy" && acceptedFor !== `${address}:${detail.address}`)}
                      onClick={() => transact(detail, action)}
                    >
                      {busy ? "Processing…" : actionNames[action]}
                    </button>
                  ))}
                  {!address && (
                    <button className="button dark" onClick={walletConnect}>
                      Connect to trade
                    </button>
                  )}
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          window.location.href,
                        );
                        setNotice("Option link copied.");
                      } catch {
                        setError("Copy the link from your address bar.");
                      }
                    }}
                  >
                    Copy link
                  </button>
                </div>
                <p className="fine">
                  Exercise manually before expiration. No automatic exercise or
                  partial purchases. Collateral is not returned automatically.
                  Purchased options cannot be transferred or resold in this version.
                </p>
              </>
            ) : (
              <div className="empty">
                <h3>
                  {market.isFetching
                    ? "Looking up the option…"
                    : "This option is not among the loaded contracts."}
                </h3>
                <p>
                  Transactions are only enabled for contracts created by the
                  configured factory.
                </p>
                {market.data && market.data.total > BigInt(limit) && (
                  <button
                    className="button"
                    onClick={() => setLimit((n) => n + 100)}
                  >
                    Load 100 older options
                  </button>
                )}
              </div>
            )}
          </div>
  );

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">
          stock options<span>lab</span>
        </Link>
        <div className="network">
          <i />
          {net.name}
        </div>
        {isConnected ? (
          <button
            className="button"
            disabled={busy}
            onClick={() => disconnect()}
            title="Disconnect wallet"
          >
            {short(address!)} · Disconnect
          </button>
        ) : (
          <button className="button dark" onClick={walletConnect}>
            Connect wallet
          </button>
        )}
      </header>
      <section className="instrument-bar" aria-label="Selected market">
        <div className="instrument-identity"><span className="asset-icon">{net.underlying.symbol.slice(0, 1)}</span><div><div className="eyebrow">STOCK TOKEN OPTIONS</div><h1>{net.underlying.symbol} <span>/ {net.quote.symbol}</span></h1></div></div>
        <div className="market-metrics"><div><span>Open offers</span><strong>{market.data ? positions.filter(p => p.state === 0 && p.expiry > now).length : "—"}</strong></div><div><span>Settlement</span><strong>Token delivery</strong></div><div><span>Network</span><strong>{chain.id === 31337 ? "Local simulation" : "Robinhood testnet"}</strong></div></div>
        <span className="test-badge">TEST FUNDS · NO REAL VALUE</span>
      </section>
      {wrongChain && (
        <div className="banner warning">
          <span>
            Your wallet is on another network. Switch to {net.name} to trade.
          </span>
          <button className="button" disabled={busy} onClick={switchNetwork}>
            Switch network
          </button>
        </div>
      )}
      {(notice || error) && (
        <div
          className={`banner ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <div>
            {error || notice}
            {txHash && (
              <div className="tx-link">
                {explorer(`tx/${txHash}`, `Transaction ${short(txHash)}`)}
              </div>
            )}
          </div>
          {!busy && (
            <button
              className="dismiss"
              aria-label="Dismiss notification"
              onClick={() => {
                setNotice("");
                setError("");
                setTxHash(null);
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      {isConnected && ready && (
        <section className="wallet-panel">
          <div className="eyebrow">YOUR WALLET · {short(address!)}</div>
          <div className="wallet-row">
            {balances.data ? (
              <>
                <span>
                  {displayAmount(balances.data.underlying, net.underlying)}
                </span>
                <span>{displayAmount(balances.data.quote, net.quote)}</span>
                <span>{units(balances.data.gas, 18)} ETH</span>
              </>
            ) : (
              <span>
                {balances.isError
                  ? "Could not load balances."
                  : "Loading balances…"}
              </span>
            )}
            <div className="wallet-faucets">
              <button disabled={!canAct} onClick={() => faucet(net.quote)}>
                Get {net.quote.symbol}
              </button>
              {chain.id === 31337 && net.underlying.isMock && (
                <button
                  disabled={!canAct}
                  onClick={() => faucet(net.underlying)}
                >
                  Get {net.underlying.symbol}
                </button>
              )}
              {chain.id === 46630 && (
                <a
                  href="https://faucet.testnet.chain.robinhood.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Faucet ETH / TSLA ↗
                </a>
              )}
            </div>
          </div>
        </section>
      )}
      <section className="market" id="market">
        <div className="tabs" role="tablist" aria-label="Sections">
          {[
            ["market", "Options chain"],
            ["create", "Create offer"],
            ["mine", "My positions"],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key as typeof tab);
                openDetail(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {!ready && tab === "mine" ? (
          <div className="empty setup">
            <span className="empty-icon">↗</span>
            <h2>The next step is connecting the factory.</h2>
            <p>
              The interface is ready for {net.name}. No deployment has been
              configured on this network yet.
            </p>
            <p>
              To try the complete flow locally, follow the repository
              quickstart. Run <code>npm run anvil</code> and, in another
              terminal, <code>npm run deploy:local</code>,{" "}
              <code>npm run seed:local</code> and <code>npm run dev:local</code>
              .
            </p>
            <a
              className="button"
              href="https://faucet.testnet.chain.robinhood.com/"
              target="_blank"
              rel="noreferrer"
            >
              Open Robinhood faucet ↗
            </a>
          </div>
        ) : ready && health.isError && tab !== "market" ? (
          <div className="empty" role="alert">
            <h2>Could not validate the deployment.</h2>
            <p>
              The network or contracts do not match the manifest, or the RPC is
              unavailable. Transactions are disabled.
            </p>
            <button className="button" onClick={() => void health.refetch()}>
              Retry connection
            </button>
          </div>
        ) : ready && health.isPending && tab !== "market" ? (
          <div className="empty" role="status">
            Checking network, factory, and tokens…
          </div>
        ) : selected && tab === "mine" ? (
          detailPanel
        ) : tab === "create" ? (
          <div className="create-layout">
            <form onSubmit={create}>
              {!ready && <div className="banner warning" role="status">Preview offer terms. Creating or buying requires a configured contract deployment.</div>}
              <div className="section-head">
                <div>
                  <div className="eyebrow">YOU SET THE TERMS</div>
                  <h2>Create an offer</h2>
                </div>
              </div>
              <fieldset className="kind-picker">
                <legend>Option type</legend>
                <label className={kind === 0 ? "chosen" : ""}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === 0}
                    onChange={() => setKind(0)}
                    disabled={busy}
                  />{" "}
                  Covered call<span>You deposit {net.underlying.symbol}</span>
                </label>
                <label className={kind === 1 ? "chosen" : ""}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === 1}
                    onChange={() => setKind(1)}
                    disabled={busy}
                  />{" "}
                  Put<span>You deposit {net.quote.symbol}</span>
                </label>
              </fieldset>
              <div className="lot-presets" aria-label="Lot size shortcuts">
                <span>Lot size</span>
                <button type="button" disabled={busy} aria-pressed={quantity === "100"} onClick={() => setQuantity("100")}>100 tokens</button>
                <button type="button" disabled={busy} aria-pressed={quantity === "1"} onClick={() => setQuantity("1")}>1 token</button>
                <span>or enter a custom quantity below</span>
              </div>
              <label className="field">
                Quantity of {net.underlying.symbol}
                <input
                  inputMode="decimal"
                  placeholder="0.5"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  disabled={busy}
                />
                <small>
                  Token units, with up to {net.underlying.decimals} decimal
                  places. A 100-token lot is not a guarantee of 100 shares.
                </small>
              </label>
              <div className="form-columns">
                <label className="field">
                  Total exercise amount · {net.quote.symbol}
                  <input
                    inputMode="decimal"
                    placeholder="100"
                    value={strike}
                    onChange={(e) => setStrike(e.target.value)}
                    required
                    disabled={busy}
                  />
                  <small>For the entire lot, not a price per token.</small>
                </label>
                <label className="field">
                  Total premium · {net.quote.symbol}
                  <input
                    inputMode="decimal"
                    placeholder="5"
                    value={premium}
                    onChange={(e) => setPremium(e.target.value)}
                    required
                    disabled={busy}
                  />
                  <small>You receive it when someone buys your offer.</small>
                </label>
              </div>
              <fieldset className="expiration-picker" disabled={busy}>
                <legend>Expiration</legend>
                <div className="expiry-mode">
                  <label><input type="radio" name="expiry-mode" checked={expiryMode === "suggested"} onChange={() => setExpiryMode("suggested")} /> Suggested dates</label>
                  <label><input type="radio" name="expiry-mode" checked={expiryMode === "custom"} onChange={() => setExpiryMode("custom")} /> Custom expiration</label>
                </div>
                {expiryMode === "suggested" ? <>
                  <p className="fine">Fridays at 4:00 PM New York time. Monthly dates use the third Friday.</p>
                  <div className="expiry-grid">
                    {expirySuggestions.map(suggestion => <label key={suggestion.value} className={effectiveExpiry === suggestion.value ? "chosen" : ""}>
                      <input type="radio" name="preset-expiry" value={suggestion.value} checked={effectiveExpiry === suggestion.value} onChange={() => setPresetExpiry(suggestion.value)} />
                      <span>{suggestion.label}<small>{suggestion.cadence}</small></span>
                    </label>)}
                  </div>
                  <p className="fine">Protocol date suggestions, not exchange-listed series. No holiday or early-close adjustments. New York daylight saving time is applied.</p>
                </> : <label className="field">
                  Expiration · your local time
                  <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
                </label>}
                {deadlinePreview(effectiveExpiry) && <p className="deadline-preview">Exercise strictly before <strong>{deadlinePreview(effectiveExpiry)}</strong></p>}
              </fieldset>
              <button
                className="button dark full"
                type="submit"
                disabled={!canAct}
              >
                {busy ? "Processing…" : "Approve collateral and create offer"}
              </button>
              {!isConnected && (
                <p className="fine">Connect a wallet to create your offer.</p>
              )}
            </form>
            <aside className="create-note">
              <span className="pill">
                {kind === 0 ? "CALL" : "PUT"} · 100% COLLATERALIZED
              </span>
              <h3>
                Clear terms.
                <br />
                Funds in the contract.
              </h3>
              <p>
                You will deposit{" "}
                <strong>
                  {kind === 0
                    ? quantity || "the quantity of"
                    : strike || "the amount of"}{" "}
                  {kind === 0 ? net.underlying.symbol : net.quote.symbol}
                </strong>{" "}
                as collateral.
              </p>
              <p>
                The buyer can exercise at any time before expiration. If the
                option expires unexercised, reclaim the deposit from My
                positions.
              </p>
              <p>
                Once purchased, the offer cannot be canceled. The premium and
                amounts remain fixed.
              </p>
              <p><strong>No closing-price calculation.</strong> Exercise exchanges the agreed lot for the agreed payment. No app server chooses a settlement price or changes the deadline.</p>
            </aside>
          </div>
        ) : tab === "market" ? (
          <div className="trading-workspace">
            <div>
              <OptionsChain positions={positions} now={now} selected={detail} symbol={net.underlying.symbol}
                quoteSymbol={net.quote.symbol} underlyingDecimals={net.underlying.decimals} quoteDecimals={net.quote.decimals}
                loading={ready && (market.isFetching || health.isPending)} unavailable={!ready || health.isError || market.isError}
                onSelect={openDetail} onRefresh={() => { void health.refetch(); void market.refetch(); }}
                onCreate={() => { setTab("create"); openDetail(null); }} />
              {market.data && market.data.total > BigInt(limit) && <div className="pagination"><p>Latest {limit} of {market.data.total.toString()} contracts loaded. Older offers may have other dates or strikes.</p><button className="button" disabled={market.isFetching} onClick={() => setLimit(n => n + 100)}>Load 100 older options</button></div>}
            </div>
            <aside className="trade-ticket" aria-label="Trade ticket">
              <div className="ticket-heading"><span>TRADE TICKET</span><span className="ticket-mode">PRIMARY MARKET</span></div>
              {selected ? detailPanel : <div className="ticket-empty">
                <div className="ticket-symbol">↗</div><h2>Select a contract</h2><p>Choose a call or put from the chain to review the premium, lot, and exercise terms.</p>
                <dl><div><dt>Order type</dt><dd>Fixed-price offer</dd></div><div><dt>Exercise</dt><dd>Manual · American</dd></div><div><dt>Collateral</dt><dd>Fully deposited</dd></div><div><dt>Resale</dt><dd>Not available</dd></div></dl>
                <button className="button full" onClick={() => { setTab("create"); openDetail(null); }}>Write an option</button>
                <p className="fine">Buying requires the premium. Exercising later requires the agreed tokens and gas, before the deadline.</p>
              </div>}
            </aside>
          </div>
        ) : (
          <>
            <div className="section-head">
              <div>
                <div className="eyebrow">
                  {tab === "mine" ? "YOUR ACTIVITY" : "THE MARKET"}
                </div>
                <h2>{tab === "mine" ? "My positions" : "Open offers"}</h2>
              </div>
              <div className="filters">
                {[
                  ["all", "All"],
                  ["call", "Calls"],
                  ["put", "Puts"],
                ].map(([value, text]) => (
                  <button
                    className={filter === value ? "selected" : ""}
                    key={value}
                    onClick={() => setFilter(value as typeof filter)}
                  >
                    {text}
                  </button>
                ))}
                <button
                  className="refresh"
                  disabled={market.isFetching}
                  onClick={() => void market.refetch()}
                  aria-label="Refresh options"
                >
                  ↻
                </button>
              </div>
            </div>
            {tab === "mine" && !address ? (
              <div className="empty">
                <h3>Your positions live in your wallet.</h3>
                <p>Connect it to see the options you created or bought.</p>
                <button className="button dark" onClick={walletConnect}>
                  Connect wallet
                </button>
              </div>
            ) : market.isPending ? (
              <div className="empty" role="status">
                Loading contracts on {net.name}…
              </div>
            ) : visible.length ? (
              <div className="option-grid">
                {visible.map((position) => (
                  <button
                    className="option-card"
                    key={position.address}
                    onClick={() => openDetail(position.address)}
                  >
                    <div className="card-top">
                      <span
                        className={`type ${position.optionType === 1 ? "put" : ""}`}
                      >
                        {position.optionType === 0 ? "CALL" : "PUT"}
                      </span>
                      <span className="fine">{status(position, now)}</span>
                    </div>
                    <h3>
                      {displayAmount(position.underlyingAmount, net.underlying)}
                    </h3>
                    <div className="card-terms">
                      <div>
                        <span>Total premium</span>
                        <strong>
                          {displayAmount(position.premium, net.quote)}
                        </strong>
                      </div>
                      <div>
                        <span>Total exercise</span>
                        <strong>
                          {displayAmount(position.strikeTotal, net.quote)}
                        </strong>
                      </div>
                    </div>
                    <div className="card-bottom">
                      <span>
                        Expires{" "}
                        {new Date(
                          Number(position.expiry) * 1000,
                        ).toLocaleString("en-US", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      <span>View option ↗</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              !market.isError && (
                <div className="empty">
                  <span className="empty-icon">↗</span>
                  <h3>
                    {tab === "mine"
                      ? "You have no loaded positions yet."
                      : "There are no open offers yet."}
                  </h3>
                  <p>
                    Create an option and share the link with your counterparty.
                  </p>
                  <button className="button" onClick={() => setTab("create")}>
                    Create the first offer
                  </button>
                </div>
              )
            )}
            {market.data && market.data.total > BigInt(limit) && (
              <div className="pagination">
                <p>
                  Showing the latest {limit} of {market.data.total.toString()}{" "}
                  options. Your older positions may be in the next batch.
                </p>
                <button
                  className="button"
                  disabled={market.isFetching}
                  onClick={() => setLimit((n) => n + 100)}
                >
                  Load 100 older options
                </button>
              </div>
            )}
          </>
        )}
        <details className="exercise-guide">
          <summary>How exercise and expiration work</summary>
          <div className="exercise-steps">
            <div><strong>01 · Agree fixed terms</strong><p>The lot, exercise payment, premium, and deadline are fixed when the offer is created. There is no market-price settlement or price oracle.</p></div>
            <div><strong>02 · Exercise before the deadline</strong><p>The buyer signs a transaction to exchange tokens at the agreed terms. Have the required tokens, approvals, and gas ready. Submission alone is not enough: the transaction must execute before the onchain deadline.</p></div>
            <div><strong>03 · An unused right expires</strong><p>No automatic exercise, payout, or premium refund, even if exercising would have been profitable. The writer keeps the premium and can reclaim the collateral.</p></div>
          </div>
          <p className="fine">The contract uses the block timestamp. The countdown is an estimate, and network delays can prevent timely execution. No app operator can extend an existing contract&apos;s deadline or override its terms.</p>
        </details>
        {ready && market.isError && (
          <div className="banner error" role="alert">
            Could not refresh network data.{" "}
            {market.data
              ? "Displayed data may be stale; refresh before trading."
              : "Check the RPC and deployment."}
            <button className="button" onClick={() => void market.refetch()}>
              Retry
            </button>
          </div>
        )}
        <p className="raw-notice">
          Amounts use ERC-20 token units, not a fixed number of shares. The
          exercise amount covers the entire lot.{" "}
          {net.underlying.isMock
            ? "This network uses a mock underlying token."
            : "Stock Tokens represent economic exposure, not direct share ownership."}
        </p>
      </section>
      <footer>
        <span>Stock Options Lab · Built by agents, coordinated by humans.</span>
        <span>
          Testnet · No real value ·{" "}
          {net.factory
            ? explorer(`address/${net.factory}`, "Factory")
            : "Factory not configured"}
        </span>
      </footer>
    </main>
  );
}
export default function Home() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
