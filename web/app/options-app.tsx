"use client";

import { WorkspaceHeader, WalletMenu, TradeTicket, PortfolioTable, ActivityTable, type WorkspaceTab } from "./workspace-ui";
import WriteOptionForm from "./write-option-form";
import OptionsChain from "./options-chain";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
  useSendTransaction,
  useWalletClient,
} from "wagmi";
import { isAddress, type Address, type Hash } from "viem";
import {
  chain,
  client,
  config,
  deployment as initialNet,
  marketRecords, asMarket, configuredMarkets,
  type Token,
} from "../lib/config";
import {
  erc20Abi,
  faucetAbi,
  optionFactoryAbi,
} from "../lib/generated/abis";
import {
  actions,
  readableNumber,
  amount,
  expiration,
  short,
  status,
  units,
  type Position,
} from "../lib/options";
import { getMarkets, getPortfolio, getTokenDisplayMetadata, quoteTotal, maximumQuantity, decodeProtocolError, prepareCreateOffer, prepareBuy, prepareExercise, prepareCancel, prepareReclaim, simulatePrepared, ProtocolError, type PreparedOperation } from "@stock-options-lab/sdk";
import { readTransactions, writeTransactions, type TransactionRecord } from "../lib/transactions";
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
const gasAmount = (value: bigint) => { const scale = 10n ** 12n; return value > 0n && value < scale ? "<0.000001 ETH" : `${value % scale ? "≈ " : ""}${readableNumber(units(value / scale * scale, 18))} ETH`; };
const errorText = (error: unknown) => { const parsed = decodeProtocolError(error); return `${parsed.message} ${parsed.nextAction}`; };

function App({ initialMarketId }: { initialMarketId?: string }) {
  const [marketId, setMarketId] = useState(initialMarketId ?? "primary");
  const net = marketRecords.find(m => m.marketId === marketId) ?? initialNet;
  const activeMarket = asMarket(net);
  const ready = !!activeMarket;

  const { address, chainId, isConnected } = useConnection();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const wallet = useWalletClient();
  const cache = useQueryClient();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [trackingReady, setTrackingReady] = useState(false);
  const [errorDetails, setErrorDetails] = useState("");
  const [estimatedGas, setEstimatedGas] = useState<bigint | null>(null);
  const pending = transactions.filter(t => t.chainId === chain.id && t.account.toLowerCase() === address?.toLowerCase() && t.status === "pending");
  const updateTransaction = (record: TransactionRecord) => setTransactions(previous => {
    const next = [record, ...previous.filter(t => t.hash !== record.hash)];
    writeTransactions(next); return next;
  });
  useEffect(() => {
    const hydrate = () => { setTransactions(readTransactions()); setTrackingReady(true); };
    const timer = setTimeout(hydrate, 0);
    window.addEventListener("storage", hydrate);
    return () => { clearTimeout(timer); window.removeEventListener("storage", hydrate); };
  }, []);
  useEffect(() => {
    if (!trackingReady) return;
    const reconcile = async () => {
      const records = readTransactions();
      for (const tx of records.filter(t => t.chainId === chain.id && t.status === "pending")) {
        try {
          const result = await client.getTransactionReceipt({ hash: tx.hash });
          updateTransaction({ ...tx, status: result.status === "success" ? "confirmed" : "reverted" });
          void cache.invalidateQueries();
        } catch { /* Missing receipts and RPC failures do not prove failure. */ }
      }
    };
    void reconcile(); const timer = setInterval(() => void reconcile(), 5000);
    return () => clearInterval(timer);
  }, [trackingReady, cache]);
  const [tab, setTab] = useState<WorkspaceTab>("market");
  const [portfolioScope, setPortfolioScope] = useState<"current" | "history">("current");
  const [filter, setFilter] = useState<"all" | "call" | "put">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [noticeScope, setNoticeScope] = useState<"global" | "trade" | "create">("global");
  const lastOffer = useRef<string | null>(null);
  const previousScroll = useRef(0);
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
  const [reviewedDraft, setReviewedDraft] = useState<string | null>(null);
  const [operationSucceeded, setOperationSucceeded] = useState(false);
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
    ready && health.isSuccess && isConnected && !wrongChain && !busy && trackingReady && pending.length === 0;

  useEffect(() => {
    const sync = () => {
      const params = new URL(window.location.href).searchParams;
      setSelected(params.get("option"));
      setAcceptedFor("");
      setReviewedDraft(null);
      if (params.get("option")) setTab("market");
      const id = params.get("market") ?? "primary";
      setMarketId(marketRecords.some(m => m.marketId === id) ? id : "primary");
    };
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
  }, [cache, net.factory]);

  const market = useQuery({
    queryKey: ["market", chain.id, address, marketId],
    enabled: ready && health.isSuccess,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: async () => {
      const snapshots = await getMarkets(client, configuredMarkets);
      const selected = snapshots.find(snapshot => snapshot.market.id === marketId) ?? snapshots[0];
      const portfolio = address ? await getPortfolio(client, configuredMarkets, address, snapshots) : undefined;
      return { ...selected, portfolio, loadedAt: Date.now() };
    },
  });
  const portfolio = market.data?.portfolio;
  const rowFor = (token: Token) => portfolio?.tokens.find(row => row.token.address.toLowerCase() === token.address?.toLowerCase());
  const balances = { data: portfolio ? { underlying: rowFor(net.underlying)?.available ?? 0n, quote: rowFor(net.quote)?.available ?? 0n, gas: portfolio.gas } : undefined, isError: market.isError };
  const displayMetadata = useQuery({ queryKey: ["token-display", chain.id, net.underlying.address], enabled: !!activeMarket, queryFn: () => getTokenDisplayMetadata(client, activeMarket!.underlying), refetchInterval: 60_000 });
  const now = market.data
    ? market.data.timestamp +
      BigInt(Math.max(0, Math.floor((clock - market.data.loadedAt) / 1000)))
    : BigInt(Math.floor(clock / 1000));
  const expirySuggestions = suggestedExpirations(Number(now) * 1000);
  const effectiveExpiry = expiryMode === "custom" ? expiry : presetExpiry || expirySuggestions[0]?.value || "";
  let expiryError = "";
  if (effectiveExpiry) { try { expiration(effectiveExpiry, Number(now) * 1000); } catch { expiryError = "Choose an expiration after the current chain time."; } }
  const positions = market.data?.positions ?? [];
  const detail =
    selected && isAddress(selected)
      ? positions.find(
          (p) => p.address.toLowerCase() === selected.toLowerCase(),
        )
      : undefined;
  const visible = (tab === "mine" ? portfolio?.positions ?? [] : positions).filter(
    (p) =>
      (filter === "all" || p.optionType === (filter === "call" ? 0 : 1)) &&
      (tab !== "mine" || (portfolioScope === "current" ? p.state <= 1 : p.state > 1)) &&
      (tab === "mine"
        ? !!address &&
          [p.writer, p.buyer].some(
            (a) => a.toLowerCase() === address.toLowerCase(),
          )
        : p.state === 0 && p.expiry > now),
  );

  function openDetail(option: string | null, nextMarketId = marketId) {
    if (busy) return;
    setOperationSucceeded(false);
    if (nextMarketId !== marketId) {
      setMarketId(nextMarketId);
      setQuantity(""); setStrike(""); setPremium(""); setExpiry(""); setPresetExpiry("");
      setReviewedDraft(null);
    }
    if (option) { lastOffer.current = option; previousScroll.current = window.scrollY; }
    requestAnimationFrame(() => {
      if (option && window.matchMedia("(max-width: 767px)").matches) {
        document.getElementById("option-review-heading")?.focus();
        window.scrollTo(0, 0);
      } else if (option) {
        document.querySelector(".trade-ticket")?.scrollIntoView({ block: "nearest" });
        document.getElementById("option-review-heading")?.focus({ preventScroll: true });
      } else if (!option && lastOffer.current) {
        const target = document.querySelector<HTMLElement>(`[data-offer="${lastOffer.current}"]`);
        if (target && target.getClientRects().length) {
          window.scrollTo(0, previousScroll.current);
          target.focus({ preventScroll: true });
        }
      }
    });
    const url = new URL(window.location.href);
    url.searchParams.set("market", nextMarketId);
    if (option) url.searchParams.set("option", option);
    else url.searchParams.delete("option");
    window.history.pushState({}, "", url);
    setSelected(option);
    setAcceptedFor("");
  }
  async function walletConnect() {
    setNoticeScope(selected ? "trade" : "global");
    setError("");
    try {
      if (!connectors[0])
        throw new Error("Install an EVM wallet in this browser to connect.");
      await connectAsync({ connector: connectors[0] });
    } catch (err) {
      setError(errorText(err));
      setErrorDetails(decodeProtocolError(err).details?.technical ?? "");
    }
  }
  async function switchNetwork() {
    try {
      await switchChainAsync({ chainId: chain.id });
      setError("");
    } catch (err) {
      setError(errorText(err));
      setErrorDetails(decodeProtocolError(err).details?.technical ?? "");
    }
  }
  async function checkWallet() {
    if (!wallet.data || (await wallet.data.getChainId()) !== chain.id || !(await wallet.data.getAddresses()).some(a => a.toLowerCase() === address?.toLowerCase())) throw new ProtocolError("WRONG_NETWORK", "Your wallet or network changed.", "Reconnect the intended wallet before signing.");
  }
  async function receipt(hash: Hash, action = "Token faucet", step: TransactionRecord["step"] = "operation") {
    setTxHash(hash);
    setNotice(step === "approval" ? "Approval sent. Waiting for confirmation…" : "Transaction sent. Waiting for confirmation…");
    let tracked: TransactionRecord = { hash, account: address!, chainId: chain.id, marketId, action, step, status: "pending", createdAt: new Date().toISOString() };
    updateTransaction(tracked);
    const result = await client.waitForTransactionReceipt({ hash, timeout: 120_000, onReplaced: replacement => {
      updateTransaction({ ...tracked, status: "replaced", replacement: replacement.transaction.hash });
      tracked = { ...tracked, hash: replacement.transaction.hash, action: replacement.reason === "cancelled" ? "Wallet cancellation" : tracked.action };
      updateTransaction(tracked); setTxHash(tracked.hash);
    } });
    updateTransaction({ ...tracked, status: result.status === "success" ? "confirmed" : "reverted" });
    if (result.status !== "success") throw new ProtocolError("REVERTED", "The transaction reverted onchain.", "Refresh balances before retrying. The receipt does not contain the original revert reason.", { txHash: result.transactionHash });
    if (tracked.action === "Wallet cancellation") throw new ProtocolError("UNAVAILABLE", "The transaction was canceled in your wallet.", "Refresh and prepare the operation again.");
    await cache.invalidateQueries();
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
    await checkWallet();
    await receipt(await writeContractAsync({ ...request, chainId: chain.id }), `Approve ${token.symbol}`, "approval");
  }
  async function run(task: () => Promise<void>, success: string) {
    if (!canAct) {
      setError("Connect your wallet to the selected network to continue.");
      return;
    }
    setBusy(true);
    setOperationSucceeded(false);
    setError("");
    setErrorDetails("");
    setEstimatedGas(null);
    setTxHash(null);
    setNotice("Preparing transaction…");
    try {
      await task();
      setNotice(success);
      setOperationSucceeded(true);
      await cache.invalidateQueries();
    } catch (err) {
      setNotice("");
      setError(errorText(err));
      setErrorDetails(decodeProtocolError(err).details?.technical ?? "");
      await cache.invalidateQueries();
    } finally {
      setBusy(false);
    }
  }
  let draft: { quantity: bigint; strikeTotal: bigint; premium: bigint } | undefined;
  let draftError = "";
  if (quantity && strike && premium) {
    try {
      const q = amount(quantity, net.underlying.decimals);
      draft = { quantity: q, strikeTotal: quoteTotal(q, amount(strike, net.quote.decimals), net.underlying.decimals), premium: quoteTotal(q, amount(premium, net.quote.decimals), net.underlying.decimals) };
    } catch (err) { draftError = decodeProtocolError(err).message; }
  }
  const collateralToken = kind === 0 ? net.underlying : net.quote;
  const collateralRow = rowFor(collateralToken);
  const requiredCollateral = draft ? kind === 0 ? draft.quantity : draft.strikeTotal : undefined;
  const insufficientCollateral = requiredCollateral !== undefined && collateralRow !== undefined && requiredCollateral > collateralRow.available;
  async function executePrepared(operation: PreparedOperation) {
    if (operation.approval) await approve(operation.approval.token, operation.approval.spender, operation.approval.amount);
    setEstimatedGas(await simulatePrepared(client, operation));
    await checkWallet();
    setNotice("Confirm the transaction in your wallet.");
    await receipt(await sendTransactionAsync({ ...operation.request, account: operation.account, chainId: chain.id }), operation.action);
  }
  const draftKey = JSON.stringify([marketId, address, chainId, kind, quantity, strike, premium, effectiveExpiry]);
  const reviewingDraft = reviewedDraft === draftKey;
  function changeTerm<T,>(setter: (value: T) => void, value: T) {
    setReviewedDraft(null);
    setter(value);
  }
  function reviewOffer(event: FormEvent) {
    event.preventDefault();
    if (!draft || expiryError || insufficientCollateral) return;
    setReviewedDraft(draftKey);
    setOperationSucceeded(false);
    requestAnimationFrame(() => document.getElementById("write-review-heading")?.focus());
  }
  async function create() {
    if (!reviewingDraft) return;
    setNoticeScope("create");
    await run(async () => {
      if (!draft || !activeMarket) throw new ProtocolError("INVALID_TERMS", draftError || "Complete the offer terms.", "Review quantity, strike and premium.");
      const block = await client.getBlock();
      const e = expiration(effectiveExpiry, Number(block.timestamp) * 1000);
      await executePrepared(await prepareCreateOffer(client, activeMarket, address!, { optionType: kind as 0 | 1, ...draft, expiry: e }));
      setTab("mine"); setPortfolioScope("current"); setReviewedDraft(null); setQuantity(""); setStrike(""); setPremium(""); setExpiry(""); setPresetExpiry("");
    }, "Option written. Collateral is deposited in its own option contract.");
  }
  async function transact(position: Position, action: string) {
    setNoticeScope("trade");
    await run(async () => {
      if (!activeMarket) throw new Error("Market is not configured.");
      if (action === "buy" && acceptedFor !== `${address}:${position.address}`) throw new ProtocolError("INVALID_TERMS", "Acknowledge the manual exercise deadline.", "Read and check the acknowledgment before buying.");
      const prepare = { buy: prepareBuy, exercise: prepareExercise, cancel: prepareCancel, reclaimExpired: prepareReclaim }[action];
      if (!prepare) throw new Error("Unsupported operation.");
      await executePrepared(await prepare(client, activeMarket, address!, position.address));
    }, "Transaction confirmed. Balances and position are up to date.");
  }
  async function faucet(token: Token) {
    const menu = document.querySelector<HTMLDetailsElement>(".wallet-menu");
    if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); }
    setNoticeScope("global");
    await run(async () => {
      setNotice(`Request test ${token.symbol} in your wallet.`);
      const { request } = await client.simulateContract({
        address: token.address!,
        abi: faucetAbi,
        functionName: "faucet",
        account: address!,
      });
      await checkWallet();
      await receipt(await writeContractAsync({ ...request, chainId: chain.id }), `Get ${token.symbol}`);
    }, `Test ${token.symbol} received.`);
  }
  const displayAmount = (value: bigint, token: Token) =>
    `${readableNumber(units(value, token.decimals), token.symbol === net.quote.symbol ? 2 : 0)} ${token.symbol}`;
  const explorer = (path: string, text: string) =>
    net.explorerUrl ? (
      <a target="_blank" rel="noreferrer" href={`${net.explorerUrl}/${path}`}>
        {text} ↗
      </a>
    ) : (
      <span>{text}</span>
    );

  const notification = (notice || error) ? (
        <div
          className={`banner ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <div>
            {error || notice}
            {error && errorDetails && <details><summary>Technical details</summary><code>{errorDetails}</code></details>}
            {!error && estimatedGas !== null && <div className="fine">Estimated network fee: {units(estimatedGas, 18)} ETH. Your wallet shows the final estimate.</div>}
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
  ) : null;

  function navigate(next: WorkspaceTab) {
    if (busy) return;
    setTab(next);
    setReviewedDraft(null);
    openDetail(null);
    if (next === "create" && ready) void market.refetch();
  }
  const detailPanel = (
    <TradeTicket title={detail ? `${detail.optionType === 0 ? "Call" : "Put"} · ${detail.writer.toLowerCase() === address?.toLowerCase() ? "Manage written option" : detail.state === 0 ? "Review purchase" : "Review position"}` : "Review option"} busy={busy} onClose={() => openDetail(null)}>
      <div className="detail">
      {detail ? <>
        <div className="section-head"><div><h2 id="option-review-heading" tabIndex={-1}>{net.underlying.symbol} option</h2><small className="detail-role">{detail.writer.toLowerCase() === address?.toLowerCase() ? "You wrote this option" : detail.buyer.toLowerCase() === address?.toLowerCase() ? "You bought this option" : `Written by ${short(detail.writer)}`}</small></div><span className="pill">{status(detail, now)}</span></div>
        <div className="review-grid">
          <div className="purchase-cost"><span className="term-label">{detail.state === 0 ? (detail.writer.toLowerCase() === address?.toLowerCase() ? "You receive if someone buys" : "Cost to buy this option") : "Agreed premium"}</span><strong>{displayAmount(detail.premium, net.quote)}</strong><small>Whole-lot premium · Exercise payment and gas separate</small></div>
          <div className="right-summary"><span className="term-label">Buyer’s exercise right · Full lot</span><p>{detail.optionType === 0 ? "Buy" : "Sell"} <strong>{displayAmount(detail.underlyingAmount, net.underlying)}</strong><br />for <strong>{displayAmount(detail.strikeTotal, net.quote)}</strong> total</p></div>
          <div className="deadline-summary"><span className="term-label">Exercise before</span><strong>{utcDeadline(detail.expiry)}</strong><small>{new Date(Number(detail.expiry) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })} · local time</small><small>{remaining(detail.expiry, now)} · estimated</small></div>
        </div>
        <div className={`deadline-notice ${detail.expiry <= now && detail.state < 2 ? "urgent" : ""}`} role="note">{detail.expiry <= now && detail.state < 2 ? "Expired: exercise is unavailable. The writer may reclaim collateral." : "Manual exercise · No resale. An unused right expires without payout or premium refund."}</div>
        {address && actions(detail, address, now).includes("exercise") && <section className="exercise-funding" aria-label="Funds for this option"><div className="funding-inline"><span>You deliver <strong>{displayAmount(detail.optionType === 0 ? detail.strikeTotal : detail.underlyingAmount, detail.optionType === 0 ? net.quote : net.underlying)}</strong></span><span>You receive <strong>{displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)}</strong></span><span>Available to deliver <strong>{balances.data ? displayAmount(detail.optionType === 0 ? balances.data.quote : balances.data.underlying, detail.optionType === 0 ? net.quote : net.underlying) : "Loading…"}</strong></span></div></section>}
        {detail.writer.toLowerCase() === address?.toLowerCase() && detail.state <= 1 && <p className="funding-inline">Collateral {displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)} · {detail.state === 1 && detail.expiry > now ? "Locked until exercise or expiry; cancellation unavailable." : "Returned to your wallet when cancellation or reclaim confirms."}</p>}
        {ready && (health.isError || market.isError) && <div className="banner error" role="alert">Could not refresh this option. Trading is disabled until current data is available.<button className="button" onClick={() => { void health.refetch(); void market.refetch(); }}>Retry connection</button></div>}
        {noticeScope === "trade" && notification}
        <div className="review-bottom">
          {actions(detail, address, now).includes("buy") && <label className="exercise-ack"><input type="checkbox" checked={acceptedFor === `${address}:${detail.address}`} disabled={busy} onChange={event => setAcceptedFor(event.target.checked ? `${address}:${detail.address}` : "")} /><span>I understand that I must exercise before the deadline or lose the right and the premium.</span></label>}
          <div className="detail-actions">
            {actions(detail, address, now).map(action => <button className="button dark" key={action} disabled={!canAct || market.isError || (action === "buy" && acceptedFor !== `${address}:${detail.address}`)} onClick={() => transact(detail, action)}>{busy ? "Processing…" : action === "buy" ? `Buy ${detail.optionType === 0 ? "call" : "put"} · ${displayAmount(detail.premium, net.quote)}` : actionNames[action]}</button>)}
            {!address && <button className="button dark" onClick={walletConnect}>Connect wallet to continue</button>}
            {operationSucceeded && <button className="button" onClick={() => navigate("mine")}>View portfolio</button>}
          </div>
        </div>
        <details className="contract-details"><summary>Contract details &amp; exercise funding</summary>
          <section className="collateral-location" aria-label="Option collateral"><span className="term-label">{detail.state <= 1 ? "Collateral deposited in this option" : "Collateral outcome"}</span><strong>{displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)}</strong>
            <p>{detail.state === 2 ? "Delivered to the buyer when the option was exercised." : detail.state >= 3 ? "Returned to the writer. This option no longer holds its agreed collateral." : detail.expiry <= now ? "The deadline has passed. The writer can reclaim this collateral; it does not return automatically." : detail.state === 0 ? "Held in this option’s contract while it waits for a buyer. The writer can cancel to recover it." : "Held in this option’s contract to back the buyer’s exercise right. The writer cannot cancel a purchased option."}</p>
            <div className="escrow-address">Option contract {explorer(`address/${detail.address}`, short(detail.address))}<button type="button" className="text-button" onClick={async () => { setNoticeScope("trade"); try { await navigator.clipboard.writeText(detail.address); setNotice("Option contract address copied."); } catch { setError("Could not copy. Find the full address below."); } }}>Copy address</button></div>
          </section>
          <p>At exercise, the buyer delivers {displayAmount(detail.optionType === 0 ? detail.strikeTotal : detail.underlyingAmount, detail.optionType === 0 ? net.quote : net.underlying)} and receives {displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)}. Gas is separate. Buying a call reduces the same payment-token balance needed to exercise.</p>
          <p>Exercise exchanges the full lot. Have the required tokens, approvals, and gas ready. A pending transaction does not reserve the right: execution must complete before the blockchain deadline.</p>
          <p>Option contract <code>{detail.address}</code></p><p>Writer <code>{detail.writer}</code></p>
          <div className="filters"><button className="button" onClick={async () => { setNoticeScope("trade"); try { await navigator.clipboard.writeText(window.location.href); setNotice("Option link copied."); } catch { setError("Copy the link from your address bar."); } }}>Copy link</button>
        {detail.expiry > now && <button className="button calendar-button" onClick={() => {
          const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
          const start = new Date(Number(detail.expiry - 3600n) * 1000);
          const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stock Options Lab//Exercise reminder//EN", "BEGIN:VEVENT", `UID:${detail.address}@stock-options-lab`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(Number(detail.expiry) * 1000))}`, "SUMMARY:Review your option before expiration", "DESCRIPTION:Manual exercise requires a confirmed transaction before the contract deadline. This reminder does not exercise your option.", `URL:${window.location.href}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
          const url = URL.createObjectURL(new Blob([body], { type: "text/calendar" })); const link = document.createElement("a"); link.href = url; link.download = "option-exercise-reminder.ics"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Add exercise reminder</button>}

          </div>
        </details>
      </> : <div className="empty"><h2 id="option-review-heading" tabIndex={-1}>{market.isFetching ? "Looking up the option…" : "Option not found in this market"}</h2><p>Only options verified in this market can be traded.</p></div>}
      </div>
    </TradeTicket>
  );
  return (
    <main className={`shell ${selected || (tab === "create" && reviewingDraft) ? "review-open" : ""}`}>
      <WorkspaceHeader tab={tab} disabled={busy} environment={chain.id === 31337 ? "Local demo" : "Testnet"} onNavigate={navigate}
        wallet={isConnected ? <WalletMenu label={short(address!)}>
          <div className="eyebrow">WALLET &amp; TEST FUNDS</div>
          <div className="wallet-row">{balances.data ? <><span>{displayAmount(balances.data.underlying, net.underlying)}</span><span>{displayAmount(balances.data.quote, net.quote)}</span><span>{gasAmount(balances.data.gas)}</span></> : <span>{ready ? "Loading balances…" : "No trading deployment configured."}</span>}
            {ready && <div className="wallet-faucets"><button disabled={!canAct} onClick={() => faucet(net.quote)}>Get {net.quote.symbol}</button>{net.underlying.isMock && <button disabled={!canAct} onClick={() => faucet(net.underlying)}>Get {net.underlying.symbol}</button>}</div>}
            {chain.id === 46630 && <a href="https://faucet.testnet.chain.robinhood.com/" target="_blank" rel="noreferrer">Robinhood test faucet ↗</a>}
            <button className="button full" disabled={busy} onClick={() => disconnect()}>Disconnect</button>
          </div>
        </WalletMenu> : <button className="button dark" onClick={walletConnect}>Connect wallet</button>} />
      <section className="instrument-bar" aria-label="Selected market">
        <div className="instrument-identity"><span className="asset-icon" aria-hidden="true">{net.underlying.symbol.slice(0, 1)}</span><div><h1>{tab === "mine" ? "Portfolio" : tab === "activity" ? "Activity" : net.underlying.symbol} <span>{tab === "mine" || tab === "activity" ? "All configured markets" : `/ ${net.quote.symbol}`}</span></h1><small>{tab === "market" || tab === "create" ? net.sandbox ? "Practice stock token · Fully collateralized options" : "Stock Token options · Fully collateralized" : net.name}</small></div></div>
        {(tab === "market" || tab === "create") && <><div className="market-selector"><label>Market<select aria-label="Market" value={marketId} disabled={busy || pending.length > 0} onChange={event => openDetail(null, event.target.value)}>{marketRecords.map(record => <option key={record.marketId} value={record.marketId}>{record.label} · {record.sandbox ? "Practice" : "Official test token"}</option>)}</select></label></div>
        <label className="trade-mode">Action<select aria-label="Trade action" value={tab === "create" ? "write" : "buy"} disabled={busy} onChange={event => navigate(event.target.value === "write" ? "create" : "market")}><option value="buy">Buy options</option><option value="write">Write option</option></select></label></>}
      </section>
      {wrongChain && <div className="banner warning"><span>Your wallet is on another network. Switch to {net.name} to trade.</span><button className="button" disabled={busy} onClick={switchNetwork}>Switch network</button></div>}
      {!(selected && noticeScope === "trade") && !(tab === "create" && noticeScope === "create") && notification}
      {pending.length > 0 && <div className="banner warning" role="status"><span>Transaction pending. New operations are paused until its receipt is known. Approvals do not deposit collateral.</span><button className="button" disabled={busy} onClick={() => navigate("activity")}>View activity</button></div>}
      <section className="market" id="market">
        {tab === "activity" ? <ActivityTable transactions={transactions.filter(t => t.chainId === chain.id && t.account.toLowerCase() === address?.toLowerCase())} explorer={explorer} />
        : tab === "mine" && selected ? detailPanel
        : tab === "mine" ? <>
          {isConnected && ready && <details className="account-overview"><summary>Balances &amp; collateral</summary>
            <div className="section-head"><h2>Your capital</h2><span className="fine">{portfolio ? `Block ${portfolio.blockNumber} · All configured markets` : "Reading balances…"}</span></div>
            {portfolio && <div className="balance-grid">{portfolio.tokens.map(row => <div className="balance-card" key={row.token.address}><h3>{row.token.symbol}<span>{row.token.isMock ? "Practice token" : "Official test token"}</span></h3><p className="fine asset-provenance">{short(row.token.address)}</p><strong className="available-number">{displayAmount(row.available, row.token)}</strong><span className="term-label">Available in wallet</span><dl className="balance-breakdown"><div><dt>Open orders</dt><dd>{displayAmount(row.openCollateral, row.token)}</dd></div><div><dt>Active collateral</dt><dd>{displayAmount(row.activeCollateral, row.token)}</dd></div><div><dt>Ready to reclaim</dt><dd>{displayAmount(row.reclaimable, row.token)}</dd></div><div className="balance-total"><dt>Total tracked</dt><dd>{displayAmount(row.totalTracked, row.token)}</dd></div></dl></div>)}</div>}
            <p className="fine">Tracked token units include collateral backing obligations. This is not net portfolio value. Purchased rights are listed separately.</p>
          </details>}
          <div className="position-toolbar"><h2>Positions &amp; orders</h2><div className="filters"><label>Status<select aria-label="Position status" value={portfolioScope} onChange={event => setPortfolioScope(event.target.value as typeof portfolioScope)}><option value="current">Open positions &amp; orders</option><option value="history">Closed options</option></select></label><label>Type<select aria-label="Position type" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">Calls &amp; puts</option><option value="call">Calls</option><option value="put">Puts</option></select></label><button className="icon-button" aria-label="Refresh portfolio" disabled={!ready || market.isFetching} onClick={() => { void health.refetch(); void market.refetch(); }}>↻</button></div></div>
          {!address ? <div className="empty"><h3>Connect to see your options and collateral.</h3><p>Your positions across configured markets appear here.</p><button className="button dark" onClick={walletConnect}>Connect wallet</button></div>
          : !ready ? <div className="empty"><h3>Trading is not available on this network yet</h3><p>No contracts are configured. Positions will appear after a valid deployment is available.</p></div>
          : health.isError || market.isError ? <div className="empty" role="alert"><h3>Could not refresh your portfolio</h3><p>Balances and positions may be outdated. Reconnect before trading.</p><button className="button" onClick={() => { void health.refetch(); void market.refetch(); }}>Retry connection</button></div>
          : market.isPending ? <div className="empty" role="status">Loading positions…</div>
          : visible.length ? <PortfolioTable positions={visible} markets={marketRecords} marketId={marketId} account={address} now={now} displayAmount={displayAmount} onSelect={openDetail} />
          : <div className="empty"><h3>{portfolioScope === "history" ? "No closed positions yet." : "No open positions or orders."}</h3><p>Browse available options or write a collateralized offer.</p><button className="button" onClick={() => navigate("create")}>Write option</button></div>}
          <details className="history-source"><summary>Source: onchain option contracts.</summary><p>Positions are reconstructed for your wallet across all configured markets, including activity from other devices. Closed options are exercised, canceled or reclaimed contracts; expired collateral remains open until reclaimed. This is not transaction-by-transaction history.</p></details>
        </>
        : tab === "create" ? <div className="create-layout">
          <WriteOptionForm values={{ kind, quantity, strike, premium, expiry, expiryMode, presetExpiry }} onChange={{ kind: value => changeTerm(setKind, value), quantity: value => changeTerm(setQuantity, value), strike: value => changeTerm(setStrike, value), premium: value => changeTerm(setPremium, value), expiry: value => changeTerm(setExpiry, value), expiryMode: value => changeTerm(setExpiryMode, value), presetExpiry: value => changeTerm(setPresetExpiry, value) }}
            underlying={net.underlying} quote={net.quote} busy={busy} effectiveExpiry={effectiveExpiry} suggestions={expirySuggestions}
            canMax={!!collateralRow && !market.isError && (kind === 0 || !!strike)}
            onMax={async () => { try { const refreshed = await market.refetch(); const row = refreshed.data?.portfolio?.tokens.find(r => r.token.address.toLowerCase() === collateralToken.address?.toLowerCase()); if (refreshed.isError || !row) throw new Error("Could not refresh available collateral."); const q = maximumQuantity(row.available, kind, kind === 1 ? amount(strike, net.quote.decimals) : 0n, net.underlying.decimals); setQuantity(units(q, net.underlying.decimals)); } catch (err) { setNoticeScope("create"); setError(errorText(err)); } }}
            canReview={!!draft && !expiryError && !insufficientCollateral} onReview={reviewOffer}>
            {!ready && <div className="banner warning" role="status">Preview offer terms. Writing requires a configured contract deployment.</div>}
            {expiryError && <div className="banner error" role="alert">{expiryError}</div>}
            {draftError && <div className="banner error" role="alert">{draftError}</div>}
            {insufficientCollateral && <div className="banner error" role="alert">Not enough {collateralToken.symbol}. Required: {displayAmount(requiredCollateral!, collateralToken)}. Available: {displayAmount(collateralRow!.available, collateralToken)}. Reduce the amount or reclaim eligible collateral.</div>}
            {health.isError || market.isError ? <div className="banner error" role="alert">Could not refresh balances or validate this deployment.<button type="button" className="button" onClick={() => { void health.refetch(); void market.refetch(); }}>Retry connection</button></div> : null}
            {noticeScope === "create" && !reviewingDraft && notification}
          </WriteOptionForm>
          {reviewingDraft && <TradeTicket title="Review offer · Deposit collateral" busy={busy} onClose={() => { setReviewedDraft(null); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()); }}>
            <aside className="create-note" aria-label="Offer funding summary"><div className="section-head"><h2 id="write-review-heading" tabIndex={-1}>{kind === 0 ? "Covered call" : "Cash-secured put"} · {net.underlying.symbol}</h2><span className="pill">Review</span></div>
              {!ready && <div className="banner warning" role="status">Preview only. No contract deployment is configured; writing is disabled.</div>}
              <dl className="balance-breakdown">
                <div><dt>Available in wallet</dt><dd>{collateralRow ? displayAmount(collateralRow.available, collateralToken) : "Connect to view"}</dd></div>
                <div className="funding-impact"><dt>Deposit for this offer</dt><dd>{displayAmount(requiredCollateral!, collateralToken)}</dd></div>
                <div><dt>Available after deposit</dt><dd>{collateralRow ? insufficientCollateral ? "Insufficient balance" : displayAmount(collateralRow.available - requiredCollateral!, collateralToken) : "Connect to view"}</dd></div>
                <div><dt>Full lot</dt><dd>{displayAmount(draft!.quantity, net.underlying)}</dd></div>
                <div><dt>Premium if purchased</dt><dd>{displayAmount(draft!.premium, net.quote)}</dd></div>
                <div><dt>Total exercise payment</dt><dd>{displayAmount(draft!.strikeTotal, net.quote)}</dd></div>
              </dl>
              <p className="fine">Exercise before {deadlinePreview(effectiveExpiry)}. {portfolio ? `Balances at block ${portfolio.blockNumber}.` : ""} Gas is separate.</p>
              <div className="deadline-notice">The buyer may exercise manually before expiry. A sold option stays collateralized until exercise or recovery after expiry.</div>
              {ready && (health.isError || market.isError) && <div className="banner error" role="alert">Could not refresh balances. Writing is disabled until current data is available.<button className="button" onClick={() => { void health.refetch(); void market.refetch(); }}>Retry connection</button></div>}
              {noticeScope === "create" && notification}
              <div className="review-bottom"><small>Collateral is deposited into the new option contract. Premium arrives only if purchased.</small><div className="detail-actions">{!isConnected ? <button className="button dark" onClick={walletConnect}>Connect wallet to continue</button> : <button className="button dark" disabled={!canAct || !draft || !!expiryError || insufficientCollateral || market.isError || !portfolio} onClick={create}>{busy ? "Processing…" : "Deposit collateral & write option"}</button>}</div></div>
              <details className="contract-details"><summary>Collateral and token details</summary><p>Writing deploys a separate option contract. Approval authorizes spending; only the creation transaction deposits collateral.</p><p>Gas available: {balances.data ? gasAmount(balances.data.gas) : "Connect to view"}.</p>{!net.underlying.isMock && <p>Stock Token display multiplier: {displayMetadata.data?.multiplier !== undefined ? units(displayMetadata.data.multiplier, 18) : "Unavailable"}. Quantities remain fixed token units.</p>}</details>
            </aside>
          </TradeTicket>}
        </div>
        : <div className={`trading-workspace ${selected ? "has-selection" : ""}`}>
          <div className="chain-container"><OptionsChain key={marketId} account={address} positions={positions} now={now} selected={detail} symbol={net.underlying.symbol} quoteSymbol={net.quote.symbol} underlyingDecimals={net.underlying.decimals} quoteDecimals={net.quote.decimals}
            loading={ready && (market.isFetching || health.isPending)} unavailable={!ready || health.isError || market.isError} configured={ready} onSelect={openDetail} onRefresh={() => { void health.refetch(); void market.refetch(); }} onCreate={() => navigate("create")} /></div>
          {selected && detailPanel}
        </div>}
        <details className="exercise-guide"><summary>How exercise and expiration work</summary><div className="exercise-steps">
          <div><strong>01 · Fixed terms</strong><p>The lot, exercise payment, premium and deadline are fixed when the option is written. There is no price oracle.</p></div>
          <div><strong>02 · Manual exercise</strong><p>The buyer exchanges tokens at the agreed terms. Execution must complete before the onchain deadline; submission alone is not enough.</p></div>
          <div><strong>03 · Expiration</strong><p>No automatic payout, exercise or premium refund. The writer keeps the premium and manually reclaims unused collateral.</p></div>
        </div><p className="raw-notice">Quantities refer to tokens, not a guaranteed number of shares. {net.underlying.isMock ? "This market uses a mock underlying." : "Stock Tokens represent economic exposure, not direct share ownership."}</p></details>
      </section>
      <footer><span>Stock Options Lab · Fully collateralized options</span><span>{net.name} · Manual exercise · Physical token delivery</span></footer>
    </main>
  );
}
export default function Home({ initialMarketId }: { initialMarketId?: string }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App initialMarketId={initialMarketId} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
