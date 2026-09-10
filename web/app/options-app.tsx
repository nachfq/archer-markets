"use client";

import { WorkspaceHeader, WalletMenu, TradeTicket, PortfolioTable, ActivityTable, type WorkspaceTab } from "./workspace-ui";
import WriteOptionForm from "./write-option-form";
import OptionsChain from "./options-chain";
import Docs from "./docs";
import { AssetLogo, BalanceTables, FontIcon, MarketList } from "./asset-ui";
import { assetPresentation } from "../lib/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Alert } from "@/components/ui/alert";
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
  marketRecords, tradeMarkets, asMarket, configuredMarkets,
  type Token,
} from "../lib/config";
import {
  erc20Abi,
  faucetAbi,
  optionFactoryAbi,
} from "../lib/generated/abis";
import {
  actions,
  optionPrice, optionSeller, isListed,
  readableNumber,
  amount,
  expiration,
  short,
  status,
  units,
  type Position,
} from "../lib/options";
import { getMarkets, getPortfolio, getTokenDisplayMetadata, decodeProtocolError, prepareCreateOffer, prepareBuy, prepareExercise, prepareCancel, prepareReclaim, prepareBuyResale, prepareListResale, prepareCancelResale, simulatePrepared, ProtocolError, type PreparedOperation } from "@stock-options-lab/sdk";
import { readTransactions, writeTransactions, type TransactionRecord } from "../lib/transactions";
import { deadlinePreview, suggestedExpirations, utcDeadline } from "../lib/expirations";

const actionNames: Record<string, string> = {
  buy: "Buy option",
  buyResale: "Buy resale",
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

function App({ initialMarketId, initialView }: { initialMarketId?: string; initialView?: WorkspaceTab }) {
  const [marketId, setMarketId] = useState(marketRecords.find(m => m.marketId === initialMarketId)?.marketId ?? marketRecords[0]?.marketId ?? "primary");
  const net = marketRecords.find(m => m.marketId === marketId) ?? marketRecords[0] ?? initialNet;
  const activeMarket = marketRecords.length ? asMarket(net) : null;
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
  const [tab, setTab] = useState<WorkspaceTab>(initialView ?? "market");
  const docsReturn = useRef<{ tab: WorkspaceTab; url: string; scroll: number; focus: HTMLElement | null } | null>(null);
  const [portfolioScope, setPortfolioScope] = useState<"current" | "history">("current");
  const [filter, setFilter] = useState<"all" | "call" | "put">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const navigationLock = useRef<{ url: string; locked: boolean }>({ url: "", locked: false });
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
  const [resaleTotal, setResaleTotal] = useState("");
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
      if (navigationLock.current.locked) {
        window.history.pushState({}, "", navigationLock.current.url);
        return;
      }
      const params = new URL(window.location.href).searchParams;
      setSelected(params.get("option"));
      setAcceptedFor("");
      const view = params.get("view");
      setTab(view === "docs" ? "docs" : view === "portfolio" ? "mine" : view === "write" ? "create" : view === "activity" ? "activity" : "market");
      const id = params.get("market");
      setMarketId(marketRecords.find(m => m.marketId === id)?.marketId ?? marketRecords[0]?.marketId ?? "primary");
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
    navigationLock.current = { url: window.location.href, locked: busy || pending.length > 0 };
  }, [busy, pending.length, tab, selected, marketId]);
  useEffect(() => {
    if (tab !== "docs") return;
    const timer = requestAnimationFrame(() => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (window.location.hash && window.location.hash !== "#overview") target?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(timer);
  }, [tab]);
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
    queryKey: ["market", chain.id, address],
    enabled: ready && health.isSuccess,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: async () => {
      const snapshots = await getMarkets(client, configuredMarkets);
      const selected = snapshots.find(snapshot => snapshot.market.id === marketId) ?? snapshots[0];
      const portfolio = address ? await getPortfolio(client, configuredMarkets, address, snapshots) : undefined;
      return { ...selected, snapshots, portfolio, loadedAt: Date.now() };
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
  const positions = market.data?.snapshots.find(snapshot => snapshot.market.id === marketId)?.positions ?? [];
  const detail =
    selected && isAddress(selected)
      ? (tab === "mine" ? portfolio?.positions ?? [] : positions).find(
          (p) => p.address.toLowerCase() === selected.toLowerCase(),
        )
      : undefined;
  const visible = (tab === "mine" ? portfolio?.positions ?? [] : positions).filter(
    (p) =>
      (filter === "all" || p.optionType === (filter === "call" ? 0 : 1)) &&
      (tab !== "mine" || (portfolioScope === "current" ? p.state <= 1 && [p.writer, p.buyer].some(a => a.toLowerCase() === address?.toLowerCase()) : p.state > 1 || ![p.writer, p.buyer].some(a => a.toLowerCase() === address?.toLowerCase()))) &&
      (tab === "mine"
        ? !!address &&
          [p.writer, p.buyer, ...(p.trades ?? []).flatMap(t => [t.seller, t.buyer])].some(
            (a) => a.toLowerCase() === address.toLowerCase(),
          )
        : isListed(p, now)),
  );

  function openDetail(option: string | null, nextMarketId = marketId) {
    if (busy || (option && pending.length > 0) || (nextMarketId !== marketId && pending.length > 0)) return;
    setOperationSucceeded(false);
    setResaleTotal("");
    if (nextMarketId !== marketId) {
      setMarketId(nextMarketId);
      setQuantity(""); setStrike(""); setPremium(""); setExpiry(""); setPresetExpiry(""); setExpiryMode("suggested");
      setReviewedDraft(null);
    }
    if (option) { lastOffer.current = option; previousScroll.current = window.scrollY; }
    requestAnimationFrame(() => {
      if (tab === "mine" && option) {
        const table = document.querySelector(".positions-panel");
        if (table) table.scrollLeft = 0;
        document.getElementById("option-review-heading")?.focus({ preventScroll: true });
      } else if (option) {
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
    if (tab === "mine") url.searchParams.set("view", "portfolio");
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
      draft = { quantity: q, strikeTotal: amount(strike, net.quote.decimals), premium: amount(premium, net.quote.decimals) };
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
    requestAnimationFrame(() => document.getElementById("write-review-heading")?.focus({ preventScroll: true }));
  }
  async function create() {
    if (!reviewingDraft) return;
    setNoticeScope("create");
    await run(async () => {
      if (!draft || !activeMarket || net.legacy) throw new ProtocolError("INVALID_TERMS", draftError || "Choose a current market and complete the offer terms.", "Review quantity, exercise payment and option price.");
      const block = await client.getBlock();
      const e = expiration(effectiveExpiry, Number(block.timestamp) * 1000);
      await executePrepared(await prepareCreateOffer(client, activeMarket, address!, { optionType: kind as 0 | 1, ...draft, expiry: e }));
      setTab("mine"); setPortfolioScope("current"); setReviewedDraft(null); setQuantity(""); setStrike(""); setPremium(""); setExpiry(""); setPresetExpiry(""); setExpiryMode("suggested");
      const url = new URL(window.location.href); url.searchParams.set("view", "portfolio"); url.searchParams.delete("option"); window.history.pushState({}, "", url);
    }, "Option written. Collateral is deposited in its own option contract.");
  }
  async function transact(position: Position, action: string) {
    setNoticeScope("trade");
    await run(async () => {
      if (!activeMarket) throw new Error("Market is not configured.");
      if (["buy", "buyResale"].includes(action) && acceptedFor !== acknowledgment(position)) throw new ProtocolError("INVALID_TERMS", "Acknowledge the manual exercise deadline and current price.", "Read and check the acknowledgment before buying.");
      if (action === "buyResale") {
        await executePrepared(await prepareBuyResale(client, activeMarket, address!, position.address, { seller: position.buyer, price: position.resalePrice!, nonce: position.listingNonce! }));
        return;
      }
      const prepare = { buy: prepareBuy, exercise: prepareExercise, cancel: prepareCancel, reclaimExpired: prepareReclaim }[action];
      if (!prepare) throw new Error("Unsupported operation.");
      await executePrepared(await prepare(client, activeMarket, address!, position.address));
    }, "Transaction confirmed. Balances and position are up to date.");
  }
  async function manageResale(position: Position, cancel = false) {
    setNoticeScope("trade");
    await run(async () => {
      if (!activeMarket) throw new Error("Market is not configured.");
      await executePrepared(cancel ? await prepareCancelResale(client, activeMarket, address!, position.address) : await prepareListResale(client, activeMarket, address!, position.address, amount(resaleTotal, net.quote.decimals)));
    }, cancel ? "Resale listing removed. You still hold the exercise right." : "Resale listed. You can still exercise before expiration.");
  }
  const acknowledgment = (position: Position) => `${address}:${position.address}:${optionSeller(position)}:${optionPrice(position)}:${position.listingNonce ?? 0n}`;
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

  function navigate(next: WorkspaceTab) {
    if (busy) return;
    if (next === "docs") { openDocs(); return; }
    if (tab === "docs" && docsReturn.current?.tab === next) { closeDocs(); return; }
    if ((next === "market" || next === "create") && net.legacy && tradeMarkets[0]) { setMarketId(tradeMarkets[0].marketId!); setQuantity(""); setStrike(""); setPremium(""); }
    setTab(next);
    setReviewedDraft(null);
    setSelected(null);
    setAcceptedFor("");
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("option");
    if ((next === "market" || next === "create") && net.legacy && tradeMarkets[0]) url.searchParams.set("market", tradeMarkets[0].marketId!);
    url.searchParams.set("view", next === "mine" ? "portfolio" : next === "create" ? "write" : next === "activity" ? "activity" : "trade");
    window.history.pushState({}, "", url);
    if (next === "create" && ready) void market.refetch();
  }
  function openDocs(anchor = "overview") {
    if (busy) return;
    if (tab !== "docs") docsReturn.current = { tab, url: window.location.href, scroll: window.scrollY, focus: document.activeElement as HTMLElement | null };
    const url = new URL(window.location.href);
    url.searchParams.set("view", "docs");
    url.hash = anchor;
    window.history.pushState({}, "", url);
    setTab("docs");
  }
  function closeDocs() {
    const previous = docsReturn.current;
    if (!previous) { navigate("market"); return; }
    window.history.pushState({}, "", previous.url);
    setTab(previous.tab);
    requestAnimationFrame(() => { window.scrollTo(0, previous.scroll); if (previous.focus?.id) document.getElementById(previous.focus.id)?.focus({ preventScroll: true }); });
  }
  const exerciseWarning = <><FontIcon name="triangle-exclamation" /> <span>Manual exercise. An unused right expires without payout or premium refund. <a id="manual-exercise-link" href="?view=docs#manual-exercise" aria-disabled={busy} onClick={event => { event.preventDefault(); openDocs("manual-exercise"); }}>How manual exercise works</a></span></>;
  const detailPanel = (
    <TradeTicket inline={tab === "mine"} title={detail ? `${detail.optionType === 0 ? "Call" : "Put"} · ${detail.writer.toLowerCase() === address?.toLowerCase() ? "Manage written option" : detail.state === 0 ? "Review purchase" : "Review position"}` : "Review option"} busy={busy} onClose={() => openDetail(null)}>
      <div className="detail">
      {detail ? <>
        <div className="section-head"><div className="asset-cell"><AssetLogo presentation={assetPresentation(net, "underlying")} /><div><h2 id="option-review-heading" tabIndex={-1}>{assetPresentation(net, "underlying").name} · {net.underlying.symbol}</h2><small className="detail-role">{detail.writer.toLowerCase() === address?.toLowerCase() ? "You wrote this option" : detail.buyer.toLowerCase() === address?.toLowerCase() ? "You bought this option" : `Written by ${short(detail.writer)}`}</small></div></div><span className="pill">{status(detail, now)}</span></div>
        <div className="review-grid">
          <div className="purchase-cost"><span className="term-label">01 · {isListed(detail, now) ? (optionSeller(detail).toLowerCase() === address?.toLowerCase() ? "You receive when purchased" : "You pay to buy this option") : detail.trades?.length ? "Last purchase — total" : "Original option price"}</span><strong>{displayAmount(optionPrice(detail), net.quote)}</strong><small>One payment for {displayAmount(detail.underlyingAmount, net.underlying)}{detail.state === 1 && (detail.resalePrice ?? 0n) > 0n ? " · Resale" : ""}</small><p className="fine">Buys the right, not the tokens. Exercise payment and gas are separate.</p></div>
          <div className="right-summary"><span className="term-label">02 · Buyer’s exercise right</span><h3>{detail.optionType === 0 ? "Right to buy" : "Right to sell"}</h3><p><strong>{displayAmount(detail.underlyingAmount, net.underlying)}</strong><br />for <strong>{displayAmount(detail.strikeTotal, net.quote)}</strong> total</p><p className="fine">Only at exercise: buyer delivers {displayAmount(detail.optionType === 0 ? detail.strikeTotal : detail.underlyingAmount, detail.optionType === 0 ? net.quote : net.underlying)} and receives {displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)}.</p></div>
          <div className="deadline-summary"><span className="term-label">03 · Exercise before</span><strong>{utcDeadline(detail.expiry)}</strong><small>{new Date(Number(detail.expiry) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })} · local time</small><small>{remaining(detail.expiry, now)} · estimated</small></div>
        </div>
        <Alert className={`deadline-notice ${detail.expiry <= now && detail.state < 2 ? "urgent" : ""}`} role="note">{exerciseWarning}{detail.expiry <= now && detail.state < 2 && <strong>Expired: exercise is unavailable. The writer may reclaim collateral.</strong>}</Alert>
        {address && actions(detail, address, now).includes("exercise") && <section className="exercise-funding" aria-label="Funds for this option"><div className="funding-inline"><span>You deliver <strong>{displayAmount(detail.optionType === 0 ? detail.strikeTotal : detail.underlyingAmount, detail.optionType === 0 ? net.quote : net.underlying)}</strong></span><span>You receive <strong>{displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)}</strong></span><span>Available to deliver <strong>{balances.data ? displayAmount(detail.optionType === 0 ? balances.data.quote : balances.data.underlying, detail.optionType === 0 ? net.quote : net.underlying) : "Loading…"}</strong></span></div></section>}
        {detail.writer.toLowerCase() === address?.toLowerCase() && detail.state <= 1 && <p className="funding-inline">Collateral {displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)} · {detail.state === 1 && detail.expiry > now ? "Locked until exercise or expiry; cancellation unavailable." : "Returned to your wallet when cancellation or reclaim confirms."}</p>}
        {ready && (health.isError || market.isError) && <div className="banner error" role="alert">Could not refresh this option. Trading is disabled until current data is available.<button className="button" onClick={() => { void health.refetch(); void market.refetch(); }}>Retry connection</button></div>}
        {noticeScope === "trade" && notification}
        <div className="review-bottom">
          {actions(detail, address, now).some(action => ["buy", "buyResale"].includes(action)) && <label className="exercise-ack"><input type="checkbox" checked={acceptedFor === acknowledgment(detail)} disabled={busy} onChange={event => setAcceptedFor(event.target.checked ? acknowledgment(detail) : "")} /><span>I understand that I must exercise before the deadline or lose the right and the premium.</span></label>}
          <div className="detail-actions">
            {actions(detail, address, now).map(action => <button className="button dark" key={action} disabled={!canAct || market.isError || (["buy", "buyResale"].includes(action) && acceptedFor !== acknowledgment(detail))} onClick={() => transact(detail, action)}>{busy ? "Processing…" : ["buy", "buyResale"].includes(action) ? `Buy ${detail.optionType === 0 ? "call" : "put"} · ${displayAmount(optionPrice(detail), net.quote)}` : actionNames[action]}</button>)}
            {!address && <button className="button dark" onClick={walletConnect}>Connect wallet to continue</button>}
            {operationSucceeded && <button className="button" onClick={() => navigate("mine")}>View portfolio</button>}
          </div>
        </div>
        {net.version === 2 && detail.buyer.toLowerCase() === address?.toLowerCase() && detail.state === 1 && detail.expiry > now && <section className="resale-form" aria-label="Resell this option"><div><h3>{(detail.resalePrice ?? 0n) > 0n ? "Manage resale listing" : "Resell your exercise right"}</h3><p className="fine">You keep the right until someone buys. Collateral and exercise terms do not change.</p></div><label className="field">Resale price — total · {net.quote.symbol}<Input inputMode="decimal" placeholder={units(optionPrice(detail), net.quote.decimals)} value={resaleTotal} disabled={busy} onChange={event => setResaleTotal(event.target.value)} /></label><div className="detail-actions"><Button disabled={!canAct || market.isError || !resaleTotal} onClick={() => manageResale(detail)}>{(detail.resalePrice ?? 0n) > 0n ? "Update resale price" : "List for resale"}</Button>{(detail.resalePrice ?? 0n) > 0n && <Button variant="outline" disabled={!canAct || market.isError} onClick={() => manageResale(detail, true)}>Remove listing</Button>}</div></section>}
        {(detail.trades?.length ?? 0) > 0 && <details className="contract-details"><summary>Ownership &amp; payments</summary><ol className="ownership-history">{detail.trades!.map(trade => <li key={trade.transactionHash}><span>{short(trade.seller)} → {short(trade.buyer)}</span><strong>{displayAmount(trade.price, net.quote)}</strong><small>{explorer(`tx/${trade.transactionHash}`, `Block ${trade.blockNumber}`)}</small></li>)}</ol></details>}
        {net.legacy && <p className="fine">Legacy contract · Exercise and recovery remain available. Resale is not supported.</p>}
        <details className="contract-details"><summary>Contract details &amp; exercise funding</summary>
          <section className="collateral-location" aria-label="Option collateral"><span className="term-label">{detail.state <= 1 ? "Collateral deposited in this option" : "Collateral outcome"}</span><strong>{displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)}</strong>
            <p>{detail.state === 2 ? "Delivered to the buyer when the option was exercised." : detail.state >= 3 ? "Returned to the writer. This option no longer holds its agreed collateral." : detail.expiry <= now ? "The deadline has passed. The writer can reclaim this collateral; it does not return automatically." : detail.state === 0 ? "Held in this option’s contract while it waits for a buyer. The writer can cancel to recover it." : "Held in this option’s contract to back the buyer’s exercise right. The writer cannot cancel a purchased option."}</p>
            <div className="escrow-address">Option contract {explorer(`address/${detail.address}`, short(detail.address))}<button type="button" className="text-button" onClick={async () => { setNoticeScope("trade"); try { await navigator.clipboard.writeText(detail.address); setNotice("Option contract address copied."); } catch { setError("Could not copy. Find the full address below."); } }}>Copy address</button></div>
          </section>
          <p>At exercise, the buyer delivers {displayAmount(detail.optionType === 0 ? detail.strikeTotal : detail.underlyingAmount, detail.optionType === 0 ? net.quote : net.underlying)} and receives {displayAmount(detail.optionType === 0 ? detail.underlyingAmount : detail.strikeTotal, detail.optionType === 0 ? net.underlying : net.quote)}. Gas is separate. Buying a call reduces the same payment-token balance needed to exercise.</p>
          <p>Exercise exchanges the full lot. Have the required tokens, approvals, and gas ready. A pending transaction does not reserve the right: execution must complete before the blockchain deadline.</p>
          <p>Option contract <code>{detail.address}</code></p><p>Writer <code>{detail.writer}</code></p>
          <div className="filters"><button className="button" onClick={async () => { setNoticeScope("trade"); try { const link = new URL(window.location.href); link.searchParams.delete("view"); link.hash = ""; await navigator.clipboard.writeText(link.href); setNotice("Option link copied."); } catch { setError("Copy the link from your address bar."); } }}>Copy link</button>
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
    <main className={`shell ${(tab === "market" && selected) || (tab === "create" && reviewingDraft) ? "review-open" : ""}`}>
      <WorkspaceHeader tab={tab} disabled={busy} environment={chain.id === 31337 ? "Local demo" : "Testnet"} onNavigate={navigate}
        wallet={isConnected ? <WalletMenu label={short(address!)}>
          <div className="eyebrow">WALLET &amp; TEST FUNDS</div>
          <div className="wallet-row">{balances.data ? <><span>{displayAmount(balances.data.underlying, net.underlying)}</span><span>{displayAmount(balances.data.quote, net.quote)}</span><span>{gasAmount(balances.data.gas)}</span></> : <span>{ready ? "Loading balances…" : "No trading deployment configured."}</span>}
            {ready && <div className="wallet-faucets"><DropdownMenuItem disabled={!canAct} onClick={() => faucet(net.quote)}>Get {net.quote.symbol}</DropdownMenuItem>{net.underlying.isMock && <DropdownMenuItem disabled={!canAct} onClick={() => faucet(net.underlying)}>Get {net.underlying.symbol}</DropdownMenuItem>}</div>}
            {chain.id === 46630 && <a href="https://faucet.testnet.chain.robinhood.com/" target="_blank" rel="noreferrer">Robinhood test faucet ↗</a>}
            <DropdownMenuItem disabled={busy} onClick={() => disconnect()}>Disconnect</DropdownMenuItem>
          </div>
        </WalletMenu> : <button className="button dark" onClick={walletConnect}>Connect wallet</button>} />
      <section className="instrument-bar" aria-label="Selected market" data-market-id={marketId} data-market-factory={net.factory ?? ""}>
        <div className="instrument-identity">{(tab === "market" || tab === "create") && <AssetLogo presentation={assetPresentation(net, "underlying")} />}<div><h1>{tab === "docs" ? "Documentation" : tab === "mine" ? "Portfolio" : tab === "activity" ? "Activity" : assetPresentation(net, "underlying").name} <span>{tab === "docs" ? "Know the mechanics" : tab === "mine" || tab === "activity" ? "All curated markets" : `/ ${net.quote.symbol}`}</span></h1><small>{tab === "market" || tab === "create" ? `${net.underlying.symbol} · ${marketId} · ${net.legacy ? "Legacy market" : "Fully collateralized options"}` : net.name}</small></div></div>
        {(tab === "market" || tab === "create") && <Tabs className="trade-mode" value={tab} onValueChange={value => navigate(value as WorkspaceTab)}><TabsList aria-label="Trade action"><TabsTrigger value="market" disabled={busy}>Buy Options</TabsTrigger><TabsTrigger value="create" disabled={busy || !!net.legacy}>Write Options</TabsTrigger></TabsList></Tabs>}
      </section>
      {wrongChain && <div className="banner warning"><span>Your wallet is on another network. Switch to {net.name} to trade.</span><button className="button" disabled={busy} onClick={switchNetwork}>Switch network</button></div>}
      {!(selected && noticeScope === "trade" && (tab === "market" || (tab === "mine" && visible.some(p => p.address.toLowerCase() === selected.toLowerCase())))) && !(tab === "create" && noticeScope === "create") && notification}
      {pending.length > 0 && <div className="banner warning" role="status"><span>Transaction pending. New operations are paused until its receipt is known. Approvals do not deposit collateral.</span><button className="button" disabled={busy} onClick={() => navigate("activity")}>View activity</button></div>}
      <div className={tab === "market" || tab === "create" ? "workspace-layout" : "workspace-single"}>
      {(tab === "market" || tab === "create") && <MarketList markets={tradeMarkets} selected={marketId} disabled={busy || pending.length > 0} onSelect={id => openDetail(null, id)} />}
      <section className="market" id="market">
        {tab === "docs" ? <Docs onBack={closeDocs} />
        : tab === "activity" ? <ActivityTable transactions={transactions.filter(t => t.chainId === chain.id && t.account.toLowerCase() === address?.toLowerCase())} explorer={explorer} />
        : tab === "mine" ? <>
          <BalanceTables markets={marketRecords} portfolio={portfolio} stale={health.isError || market.isError} />
          <div className="position-toolbar"><h2>Positions &amp; orders</h2><div className="filters"><label>Status<select aria-label="Position status" disabled={busy || pending.length > 0} value={portfolioScope} onChange={event => { openDetail(null); setPortfolioScope(event.target.value as typeof portfolioScope); }}><option value="current">Open positions &amp; orders</option><option value="history">Closed &amp; resold options</option></select></label><label>Type<select aria-label="Position type" disabled={busy || pending.length > 0} value={filter} onChange={event => { openDetail(null); setFilter(event.target.value as typeof filter); }}><option value="all">Calls &amp; puts</option><option value="call">Calls</option><option value="put">Puts</option></select></label><button className="icon-button" aria-label="Refresh portfolio" disabled={!ready || market.isFetching} onClick={() => { void health.refetch(); void market.refetch(); }}>↻</button></div></div>
          {!address ? <div className="empty"><h3>Connect to see your options and collateral.</h3><p>Your positions across configured markets appear here.</p><button className="button dark" onClick={walletConnect}>Connect wallet</button></div>
          : !ready ? <div className="empty"><h3>Trading is not available on this network yet</h3><p>No contracts are configured. Positions will appear after a valid deployment is available.</p></div>
          : health.isError || market.isError ? <div className="empty" role="alert"><h3>Could not refresh your portfolio</h3><p>Balances and positions may be outdated. Reconnect before trading.</p><button className="button" onClick={() => { void health.refetch(); void market.refetch(); }}>Retry connection</button></div>
          : market.isPending ? <div className="empty" role="status">Loading positions…</div>
          : visible.length ? <PortfolioTable positions={visible} markets={marketRecords} marketId={marketId} account={address} now={now} displayAmount={displayAmount} onSelect={openDetail} selected={selected} detail={detailPanel} disabled={busy || pending.length > 0} />
          : <div className="empty"><h3>{portfolioScope === "history" ? "No closed positions yet." : "No open positions or orders."}</h3><p>Browse available options or write a collateralized offer.</p><button className="button" onClick={() => navigate("create")}>Write option</button></div>}
          <details className="history-source"><summary>Source: onchain option contracts.</summary><p>Positions are reconstructed for your wallet across all configured markets, including activity from other devices. Closed options are exercised, canceled or reclaimed contracts; expired collateral remains open until reclaimed. This is not transaction-by-transaction history.</p></details>
        </>
        : tab === "create" ? <div className="create-layout">
          <WriteOptionForm values={{ kind, quantity, strike, premium, expiry, expiryMode, presetExpiry }} onChange={{ kind: value => changeTerm(setKind, value), quantity: value => changeTerm(setQuantity, value), strike: value => changeTerm(setStrike, value), premium: value => changeTerm(setPremium, value), expiry: value => changeTerm(setExpiry, value), expiryMode: value => changeTerm(setExpiryMode, value), presetExpiry: value => changeTerm(setPresetExpiry, value) }}
            underlying={net.underlying} quote={net.quote} busy={busy} effectiveExpiry={effectiveExpiry} suggestions={expirySuggestions}
            canMax={!!collateralRow && !market.isError}
            onMax={async () => { try { const refreshed = await market.refetch(); const row = refreshed.data?.portfolio?.tokens.find(r => r.token.address.toLowerCase() === collateralToken.address?.toLowerCase()); if (refreshed.isError || !row) throw new Error("Could not refresh available collateral."); setReviewedDraft(null); if (kind === 0) setQuantity(units(row.available, net.underlying.decimals)); else setStrike(units(row.available, net.quote.decimals)); } catch (err) { setNoticeScope("create"); setError(errorText(err)); } }}
            canReview={!net.legacy && !!draft && !!effectiveExpiry && !expiryError && !insufficientCollateral} onReview={reviewOffer}>
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
              <div className="deadline-notice">{exerciseWarning}</div>
              {ready && (health.isError || market.isError) && <div className="banner error" role="alert">Could not refresh balances. Writing is disabled until current data is available.<button className="button" onClick={() => { void health.refetch(); void market.refetch(); }}>Retry connection</button></div>}
              {noticeScope === "create" && notification}
              <div className="review-bottom"><small>Collateral is deposited into the new option contract. Premium arrives only if purchased.</small><div className="detail-actions">{!isConnected ? <button className="button dark" onClick={walletConnect}>Connect wallet to continue</button> : <button className="button dark" disabled={!!net.legacy || !canAct || !draft || !!expiryError || insufficientCollateral || market.isError || !portfolio} onClick={create}>{busy ? "Processing…" : "Deposit collateral & write option"}</button>}</div></div>
              <details className="contract-details"><summary>Collateral and token details</summary><p>Writing deploys a separate option contract. Approval authorizes spending; only the creation transaction deposits collateral.</p><p>Gas available: {balances.data ? gasAmount(balances.data.gas) : "Connect to view"}.</p>{!net.underlying.isMock && <p>Stock Token display multiplier: {displayMetadata.data?.multiplier !== undefined ? units(displayMetadata.data.multiplier, 18) : "Unavailable"}. Quantities remain fixed token units.</p>}</details>
            </aside>
          </TradeTicket>}
        </div>
        : <div className={`trading-workspace ${selected ? "has-selection" : ""}`}>
          <div className="chain-container"><OptionsChain key={marketId} account={address} positions={positions} now={now} selected={detail} symbol={net.underlying.symbol} quoteSymbol={net.quote.symbol} underlyingDecimals={net.underlying.decimals} quoteDecimals={net.quote.decimals}
            loading={ready && (market.isFetching || health.isPending)} unavailable={!ready || health.isError || market.isError} configured={ready} onSelect={openDetail} onRefresh={() => { void health.refetch(); void market.refetch(); }} onCreate={() => navigate("create")} /></div>
          {selected && detailPanel}
        </div>}
      </section>
      </div>
      <footer><span>Stock Options Lab · Fully collateralized options</span><span>{net.name} · Manual exercise · Physical token delivery</span></footer>
    </main>
  );
}
export default function Home({ initialMarketId, initialView }: { initialMarketId?: string; initialView?: WorkspaceTab }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App initialMarketId={initialMarketId} initialView={initialView} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
