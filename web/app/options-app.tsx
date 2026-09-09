"use client";

import Link from "next/link";
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
  const [tab, setTab] = useState<"market" | "create" | "mine" | "activity">("market");
  const [portfolioScope, setPortfolioScope] = useState<"current" | "history">("current");
  const [filter, setFilter] = useState<"all" | "call" | "put">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
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
    if (nextMarketId !== marketId) setMarketId(nextMarketId);
    if (option) { lastOffer.current = option; previousScroll.current = window.scrollY; }
    requestAnimationFrame(() => {
      if (option && window.matchMedia("(max-width: 767px)").matches) {
        document.getElementById("option-review-heading")?.focus();
        window.scrollTo(0, 0);
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
    setError("");
    setErrorDetails("");
    setEstimatedGas(null);
    setTxHash(null);
    setNotice("Preparing transaction…");
    try {
      await task();
      setNotice(success);
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
  async function create(event: FormEvent) {
    event.preventDefault(); setNoticeScope("create");
    await run(async () => {
      if (!draft || !activeMarket) throw new ProtocolError("INVALID_TERMS", draftError || "Complete the offer terms.", "Review quantity, strike and premium.");
      const block = await client.getBlock();
      const e = expiration(effectiveExpiry, Number(block.timestamp) * 1000);
      await executePrepared(await prepareCreateOffer(client, activeMarket, address!, { optionType: kind as 0 | 1, ...draft, expiry: e }));
      setTab("mine"); setPortfolioScope("current"); setQuantity(""); setStrike(""); setPremium(""); setExpiry(""); setPresetExpiry("");
    }, "Offer created. Collateral has been deposited in the contract.");
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

  const detailPanel = (
    <div className="detail">
      <button className="text-button" disabled={busy} onClick={() => openDetail(null)}>← Back to options</button>
      {detail ? <>
        <div className="section-head"><div><div className="eyebrow">{detail.optionType === 0 ? "CALL · RIGHT TO BUY" : "PUT · RIGHT TO SELL"}</div><h2 id="option-review-heading" tabIndex={-1}>{net.underlying.symbol} option</h2></div><span className="pill">{status(detail, now)}</span></div>
        <div className="purchase-cost">
          <span>{detail.state === 0 ? (detail.writer.toLowerCase() === address?.toLowerCase() ? "Buyer pays" : "You pay now") : "Agreed premium"}</span>
          <strong>{displayAmount(detail.premium, net.quote)}</strong>
          <small>{detail.state === 0 ? "Total premium for the entire option. Gas is paid separately." : "Premium is paid at purchase and is not refunded."}</small>
        </div>
        <div className="right-summary"><span className="term-label">{detail.writer.toLowerCase() === address?.toLowerCase() ? "The buyer’s right" : "Your right"}</span><p>{detail.optionType === 0 ? "Buy" : "Sell"} <strong>{displayAmount(detail.underlyingAmount, net.underlying)}</strong> for a total of <strong>{displayAmount(detail.strikeTotal, net.quote)}</strong> {detail.writer.toLowerCase() === address?.toLowerCase() ? "if the buyer exercises before expiration." : "if you exercise before expiration."}</p></div>
        <div className="deadline-summary"><span className="term-label">Exercise before</span><strong>{new Date(Number(detail.expiry) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}</strong><small>{utcDeadline(detail.expiry)}</small><small>{remaining(detail.expiry, now)} · estimated</small></div>
        <div className={`deadline-notice ${detail.expiry <= now && detail.state < 2 ? "urgent" : ""}`} role="note">
          <strong>{detail.expiry <= now && detail.state < 2 ? "This exercise right has expired" : "Manual exercise · No resale"}</strong>
          <p>{detail.expiry <= now && detail.state < 2 ? "Exercise is no longer possible. The writer may reclaim collateral and keeps the premium." : "An unexercised option expires without a payout or premium refund. You cannot resell this option."}</p>
        </div>
        {address && (actions(detail, address, now).includes("buy") || actions(detail, address, now).includes("exercise")) && <section className="exercise-funding" aria-label="Funds for this option"><h3>{detail.state === 0 ? "Plan for exercise" : "Exercise this option"}</h3><dl className="balance-breakdown"><div><dt>{detail.state === 0 ? "Pay at purchase" : "Premium already paid"}</dt><dd>{displayAmount(detail.premium, net.quote)}</dd></div><div><dt>You deliver at exercise</dt><dd>{displayAmount(detail.optionType === 0 ? detail.strikeTotal : detail.underlyingAmount, detail.optionType === 0 ? net.quote : net.underlying)}</dd></div><div><dt>You receive at exercise</dt><dd>{displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)}</dd></div><div><dt>Available to deliver now</dt><dd>{balances.data ? displayAmount(detail.optionType === 0 ? balances.data.quote : balances.data.underlying, detail.optionType === 0 ? net.quote : net.underlying) : "Loading…"}</dd></div></dl><p className="fine">Gas is separate. Buying a call spends part of the same payment-token balance you may later need to exercise.</p></section>}
        {detail.expiry > now && <button className="button calendar-button" onClick={() => {
          const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
          const start = new Date(Number(detail.expiry - 3600n) * 1000);
          const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stock Options Lab//Exercise reminder//EN", "BEGIN:VEVENT", `UID:${detail.address}@stock-options-lab`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(Number(detail.expiry) * 1000))}`, "SUMMARY:Review your option before expiration", "DESCRIPTION:Manual exercise requires a confirmed transaction before the contract deadline. This reminder does not exercise your option.", `URL:${window.location.href}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
          const url = URL.createObjectURL(new Blob([body], { type: "text/calendar" })); const link = document.createElement("a"); link.href = url; link.download = "option-exercise-reminder.ics"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Add exercise reminder</button>}
        {actions(detail, address, now).includes("buy") && <label className="exercise-ack"><input type="checkbox" checked={acceptedFor === `${address}:${detail.address}`} disabled={busy} onChange={event => setAcceptedFor(event.target.checked ? `${address}:${detail.address}` : "")} /><span>I understand that I must exercise before the deadline or lose the right and the premium.</span></label>}
        {noticeScope === "trade" && notification}
        <div className="detail-actions">
          {actions(detail, address, now).map(action => <button className="button dark" key={action} disabled={!canAct || market.isError || (action === "buy" && acceptedFor !== `${address}:${detail.address}`)} onClick={() => transact(detail, action)}>{busy ? "Processing…" : action === "buy" ? `Buy ${detail.optionType === 0 ? "call" : "put"} · ${displayAmount(detail.premium, net.quote)}` : actionNames[action]}</button>)}
          {!address && <button className="button dark" onClick={walletConnect}>Connect wallet to continue</button>}
          {address && !wrongChain && actions(detail, address, now).includes("buy") && acceptedFor !== `${address}:${detail.address}` && <p className="fine">Check the acknowledgment above to enable purchase.</p>}
        </div>
        <details className="contract-details"><summary>Contract details</summary>
          <p>Exercise exchanges the full token lot for the agreed total in one transaction. Have the required tokens, approvals, and gas ready. A pending transaction does not reserve your exercise right.</p>
          <p>The blockchain timestamp determines the deadline. Collateral recovery requires a transaction from the writer after expiry.</p>
          <p>Contract {explorer(`address/${detail.address}`, short(detail.address))} · Writer {short(detail.writer)}</p>
          <button className="button" onClick={async () => { setNoticeScope("trade"); try { await navigator.clipboard.writeText(window.location.href); setNotice("Option link copied."); } catch { setError("Copy the link from your address bar."); } }}>Copy link</button>
        </details>
      </> : <div className="empty"><h2 id="option-review-heading" tabIndex={-1}>{market.isFetching ? "Looking up the option…" : "Option not found in loaded offers"}</h2><p>Only options verified in this market can be traded.</p>{market.data && market.data.total > BigInt(limit) && <button className="button" onClick={() => setLimit(n => n + 100)}>Load 100 older options</button>}</div>}
    </div>
  );

  return (
    <main className={`shell ${selected ? "review-open" : ""}`}>
      <header className="topbar">
        <Link className="wordmark" href="/">
          stock options<span>lab</span>
        </Link>
        <span className="environment-badge">{chain.id === 31337 ? "Local demo" : "Testnet"} · Test funds only</span>
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
        <div className="instrument-identity"><span className="asset-icon" aria-hidden="true">{net.underlying.symbol.slice(0, 1)}</span><div><div className="eyebrow">OPTIONS ON STOCK TOKENS</div><h1>{net.underlying.symbol} <span>/ {net.quote.symbol}</span></h1></div></div>
        <div className="market-selector"><label>Market <select aria-label="Market" value={marketId} disabled={busy || pending.length > 0} onChange={event => openDetail(null, event.target.value)}>{marketRecords.map(record => <option key={record.marketId} value={record.marketId}>{record.label} · {record.sandbox ? "Practice" : "Official test token"}</option>)}</select></label></div>
        <p className="market-intro">Compare options. Know what is committed. Manage your next action.</p>
      </section>
        <nav className="tabs" aria-label="Sections">
          <div role="tablist" aria-label="Market views">{[["market", "Markets"], ["mine", "Portfolio"], ["activity", "Activity"]].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} disabled={busy} onClick={() => { setTab(key as typeof tab); openDetail(null); }}>{label}</button>)}</div>
          <button className={`button create-nav ${tab === "create" ? "current" : ""}`} disabled={busy} onClick={() => { setTab("create"); openDetail(null); if (ready) void market.refetch(); }}>Create offer</button>
        </nav>
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
      {!(selected && noticeScope === "trade") && !(tab === "create" && noticeScope === "create") && notification}
      {pending.length > 0 && <div className="banner warning" role="status"><span>{pending.length} transaction(s) awaiting a receipt. Approvals are not collateral deposits. New operations are paused until their status is known.</span><button className="button" onClick={() => { setTab("activity"); openDetail(null); }}>View activity</button></div>}
      {isConnected && ready && tab === "mine" && !selected && <section className="account-overview" aria-label="Account balances"><div className="section-head"><h2>Your capital</h2><span className="fine">{portfolio ? `Block ${portfolio.blockNumber} · All configured markets on this network` : "Reading balances and collateral…"}</span></div>{market.isError ? <p role="alert">Could not reconcile your portfolio. Cached values may be outdated; refresh before trading.</p> : null}{portfolio && <div className="balance-grid">{(tab === "mine" ? portfolio.tokens.map(row => row.token) : [net.underlying, net.quote]).map(token => { const row = rowFor(token); return row && <div className="balance-card" key={token.address}><h3>{token.symbol}<span>{token.isMock ? "Practice token" : "Official test token"}</span></h3><p className="fine asset-provenance">{marketRecords.filter(m => m.underlying.address?.toLowerCase() === token.address?.toLowerCase()).map(m => m.label).join(" · ") || "Shared payment token"} · {token.address ? short(token.address) : ""}</p><strong className="available-number">{displayAmount(row.available, token)}</strong><span className="term-label">Available in wallet</span><dl className="balance-breakdown"><div><dt>Open orders</dt><dd>{displayAmount(row.openCollateral, token)}</dd></div><div><dt>Active collateral</dt><dd>{displayAmount(row.activeCollateral, token)}</dd></div><div><dt>Ready to reclaim</dt><dd>{displayAmount(row.reclaimable, token)}</dd></div><div className="balance-total"><dt>Total tracked</dt><dd>{displayAmount(row.totalTracked, token)}</dd></div></dl></div>; })}</div>}<p className="fine">Tracked token units include collateral backing your obligations. This is not net portfolio value. Purchased option rights are listed separately.</p></section>}
      {isConnected && ready && tab === "market" && !selected && <div className="capital-inline"><span>Available in wallet</span><strong>{balances.data ? displayAmount(balances.data.underlying, net.underlying) : "Loading…"}</strong><strong>{balances.data ? displayAmount(balances.data.quote, net.quote) : "Loading…"}</strong><button className="text-button" onClick={() => setTab("mine")}>View collateral & positions →</button></div>}
      {isConnected && ready && !selected && (
        <details className="wallet-panel"><summary>Wallet &amp; test funds</summary>
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
              {net.underlying.isMock && (
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
        </details>
      )}
      <section className="market" id="market">

        {tab === "activity" ? <section className="activity-panel"><h2>Transaction activity</h2><p>Transactions sent from this browser. Onchain option positions appear in Portfolio.</p>{transactions.filter(t => t.chainId === chain.id && t.account.toLowerCase() === address?.toLowerCase()).length ? <div className="activity-list">{transactions.filter(t => t.chainId === chain.id && t.account.toLowerCase() === address?.toLowerCase()).map(tx => <div className="activity-item" key={tx.hash}><div><strong>{tx.action}</strong><span>{tx.step === "approval" ? "Token approval · does not deposit collateral" : "Contract operation"} · {tx.marketId}</span></div><span className="pill">{tx.status}</span><div>{explorer(`tx/${tx.hash}`, short(tx.hash))}<small>{new Date(tx.createdAt).toLocaleString("en-US")}</small></div></div>)}</div> : <div className="empty">No transactions recorded for this wallet in this browser.</div>}</section> : !ready && tab === "mine" ? (
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
                <button type="button" disabled={busy} aria-pressed={quantity === "0.01"} onClick={() => setQuantity("0.01")}>0.01 token</button>
                <button type="button" disabled={busy} aria-pressed={quantity === "1"} onClick={() => setQuantity("1")}>1 token</button>
                <button type="button" disabled={busy || !collateralRow || market.isError || (kind === 1 && !strike)} onClick={async () => { try { const refreshed = await market.refetch(); const row = refreshed.data?.portfolio?.tokens.find(r => r.token.address.toLowerCase() === collateralToken.address?.toLowerCase()); if (refreshed.isError || !row) throw new Error("Could not refresh available collateral."); const q = maximumQuantity(row.available, kind, kind === 1 ? amount(strike, net.quote.decimals) : 0n, net.underlying.decimals); setQuantity(units(q, net.underlying.decimals)); } catch (err) { setNoticeScope("create"); setError(errorText(err)); } }}>Max</button>
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
                  places. Delivery uses fixed token units, not adjusted share amounts.
                </small>
              </label>
              <div className="form-columns">
                <label className="field">
                  Strike per token · {net.quote.symbol}
                  <input
                    inputMode="decimal"
                    placeholder="100"
                    value={strike}
                    onChange={(e) => setStrike(e.target.value)}
                    required
                    disabled={busy}
                  />
                  <small>Exercise price for one token. The total is calculated from your quantity.</small>
                </label>
                <label className="field">
                  Premium per token · {net.quote.symbol}
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
              {expiryError && <div className="banner error" role="alert">{expiryError}</div>}
              {draftError && <div className="banner error" role="alert">{draftError}</div>}
              {insufficientCollateral && <div className="banner error" role="alert">Not enough {collateralToken.symbol}. Required: {displayAmount(requiredCollateral!, collateralToken)}. Available: {displayAmount(collateralRow!.available, collateralToken)}. Reduce the amount or reclaim eligible collateral.</div>}
              {noticeScope === "create" && notification}
              <button
                className="button dark full"
                type="submit"
                disabled={!canAct || !draft || !!expiryError || insufficientCollateral || market.isError || !portfolio}
              >
                {busy ? "Processing…" : "Approve collateral and create offer"}
              </button>
              {!isConnected && (
                <p className="fine">Connect a wallet to create your offer.</p>
              )}
            </form>
            <aside className="create-note" aria-label="Offer funding summary">
              <p className="fine">{portfolio ? `Balances at block ${portfolio.blockNumber}` : "Connect your wallet to view balances"}{market.isFetching ? " · Refreshing…" : ""}</p>
              <div className="eyebrow">YOUR OFFER · {kind === 0 ? "COVERED CALL" : "CASH-SECURED PUT"}</div><h3>What changes for you</h3>
              <p className="fine">Collateral is deposited when you create the offer. Premium arrives only when someone buys it.</p>
              <dl className="balance-breakdown">
                <div><dt>Available in wallet</dt><dd>{collateralRow ? displayAmount(collateralRow.available, collateralToken) : "Connect to view"}</dd></div>
                <div><dt>In open orders</dt><dd>{collateralRow ? displayAmount(collateralRow.openCollateral, collateralToken) : "—"}</dd></div>
                <div><dt>In active collateral</dt><dd>{collateralRow ? displayAmount(collateralRow.activeCollateral, collateralToken) : "—"}</dd></div>
                <div><dt>Ready to reclaim</dt><dd>{collateralRow ? displayAmount(collateralRow.reclaimable, collateralToken) : "—"}</dd></div>
                <div className="balance-total"><dt>Total tracked</dt><dd>{collateralRow ? displayAmount(collateralRow.totalTracked, collateralToken) : "—"}</dd></div>
                <div className="funding-impact"><dt>Deposit for this offer</dt><dd>{requiredCollateral !== undefined ? displayAmount(requiredCollateral, collateralToken) : "Enter terms"}</dd></div>
                <div><dt>Available after deposit</dt><dd>{requiredCollateral !== undefined && collateralRow ? insufficientCollateral ? "Insufficient balance" : displayAmount(collateralRow.available - requiredCollateral, collateralToken) : "—"}</dd></div>
                <div><dt>Premium if purchased</dt><dd>{draft ? displayAmount(draft.premium, net.quote) : "—"}</dd></div>
                <div><dt>Total exercise payment</dt><dd>{draft ? displayAmount(draft.strikeTotal, net.quote) : "—"}</dd></div>
                <div><dt>Gas available separately</dt><dd>{balances.data ? gasAmount(balances.data.gas) : "—"}</dd></div>
              </dl>
              <p>The buyer may exercise before the deadline. An unsold offer can be canceled; a sold option stays collateralized until exercise or recovery after expiry.</p>
              {market.isError && <p role="alert">Portfolio refresh failed. Values may be stale. Retry before creating.</p>}
              {!net.underlying.isMock && <p className="fine">Stock Token display multiplier: {displayMetadata.data?.multiplier !== undefined ? units(displayMetadata.data.multiplier, 18) : "Unavailable"}. Contract quantities remain fixed token units, not adjusted share amounts.</p>}
            </aside>
          </div>
        ) : tab === "market" ? (
          <div className={`trading-workspace ${selected ? "has-selection" : ""}`}>
            <div>
              <OptionsChain positions={positions.slice(0, limit)} now={now} selected={detail} symbol={net.underlying.symbol}
                quoteSymbol={net.quote.symbol} underlyingDecimals={net.underlying.decimals} quoteDecimals={net.quote.decimals}
                loading={ready && (market.isFetching || health.isPending)} unavailable={!ready || health.isError || market.isError} configured={ready}
                onSelect={openDetail} onRefresh={() => { void health.refetch(); void market.refetch(); }}
                onCreate={() => { setTab("create"); openDetail(null); }} />
              {market.data && market.data.total > BigInt(limit) && <div className="pagination"><p>Latest {limit} of {market.data.total.toString()} contracts loaded. Older offers may have other dates or strikes.</p><button className="button" disabled={market.isFetching} onClick={() => setLimit(n => n + 100)}>Load 100 older options</button></div>}
            </div>
            <aside className="trade-ticket" aria-label="Trade ticket">
              <div className="ticket-heading"><span>Review your option</span></div>
              {selected ? detailPanel : <div className="ticket-empty">
                <div className="ticket-symbol" aria-hidden="true">↗</div><h2>What are you buying?</h2><p>Select an offer to see its total cost and what you can buy or sell when you exercise.</p>
                <ol className="review-steps"><li><strong>Choose a date</strong><span>This is your exercise deadline.</span></li><li><strong>Compare calls and puts</strong><span>A call is a right to buy. A put is a right to sell.</span></li><li><strong>Review before buying</strong><span>See the exact lot and payment here.</span></li></ol>
                <p className="fine">Exercise is manual. Purchased options cannot be resold.</p>
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
                <h2>{tab === "mine" ? "Your positions and orders" : "Open offers"}</h2>
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
            {tab === "mine" && <div className="position-scope"><button className={portfolioScope === "current" ? "active" : ""} aria-pressed={portfolioScope === "current"} onClick={() => setPortfolioScope("current")}>Open positions & orders</button><button className={portfolioScope === "history" ? "active" : ""} aria-pressed={portfolioScope === "history"} onClick={() => setPortfolioScope("history")}>Closed history</button></div>}
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
                {visible.map((position) => {
                  const positionMarketId = "marketId" in position ? String(position.marketId) : marketId;
                  const positionMarket = marketRecords.find(m => m.marketId === positionMarketId) ?? net;
                  return (
                  <button
                    className="option-card"
                    key={position.address}
                    onClick={() => openDetail(position.address, positionMarketId)}
                  >
                    <div className="eyebrow">{position.writer.toLowerCase() === address?.toLowerCase() ? position.state === 0 && position.expiry > now ? "YOUR OPEN ORDER" : "YOUR WRITTEN OPTION" : "YOUR PURCHASED RIGHT"}</div>
                    <div className="card-top">
                      <span
                        className={`type ${position.optionType === 1 ? "put" : ""}`}
                      >
                        {position.optionType === 0 ? "CALL" : "PUT"}
                      </span>
                      <span className="fine">{status(position, now)}</span>
                    </div>
                    <h3>
                      {displayAmount(position.underlyingAmount, positionMarket.underlying)}
                    </h3>
                    <div className="card-terms">
                      <div>
                        <span>Total premium</span>
                        <strong>
                          {displayAmount(position.premium, positionMarket.quote)}
                        </strong>
                      </div>
                      <div>
                        <span>Total exercise</span>
                        <strong>
                          {displayAmount(position.strikeTotal, positionMarket.quote)}
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
                ); })}
              </div>
            ) : (
              !market.isError && (
                <div className="empty">
                  <span className="empty-icon">↗</span>
                  <h3>
                    {tab === "mine"
                      ? portfolioScope === "history" ? "No closed positions yet." : "No open positions or orders."
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
            {tab !== "mine" && market.data && market.data.total > BigInt(limit) && (
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
        <p className="raw-notice">
          Quantities refer to tokens. They do not guarantee a fixed number of shares. The
          exercise amount covers the entire lot.{" "}
          {net.underlying.isMock
            ? "This network uses a mock underlying token."
            : "Stock Tokens represent economic exposure, not direct share ownership."}
        </p>
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

      </section>
      <footer>
        <span>Stock Options Lab · Built by agents, coordinated by humans.</span>
        <span>Stock Token options · Robinhood Chain</span>
      </footer>
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
