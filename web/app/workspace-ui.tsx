"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { Deployment } from "../lib/config";
import { actions, status, short, type Position } from "../lib/options";
import type { TransactionRecord } from "../lib/transactions";

export type WorkspaceTab = "market" | "create" | "mine" | "activity";

export function WorkspaceHeader({ tab, disabled, environment, wallet, onNavigate }: {
  tab: WorkspaceTab; disabled: boolean; environment: string; wallet: ReactNode; onNavigate: (tab: WorkspaceTab) => void;
}) {
  return <header className="topbar">
    <Link className="wordmark" href="/">stock options<span>lab</span></Link>
    <nav className="tabs" aria-label="Sections">
      {([["market", "Trade"], ["mine", "Portfolio"], ["activity", "Activity"]] as const).map(([key, label]) =>
        <button key={key} aria-current={tab === key || (key === "market" && tab === "create") ? "page" : undefined}
          className={tab === key || (key === "market" && tab === "create") ? "active" : ""} disabled={disabled} onClick={() => onNavigate(key)}>{label}</button>)}
    </nav>
    <span className="environment-badge">{environment} · Test funds only</span>
    {wallet}
  </header>;
}

export function WalletMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open && ref.current.contains(document.activeElement)) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return <details className="wallet-menu" ref={ref}><summary className="button" aria-label="Wallet menu">{label} ▾</summary><div className="wallet-popover">{children}</div></details>;
}

export function TradeTicket({ title, busy, onClose, children }: {
  title: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  return <section className="trade-ticket" aria-label="Trade ticket">
    <div className="ticket-heading"><h2>{title}</h2><button className="text-button" disabled={busy} onClick={onClose}>← Back to options</button></div>
    {children}
  </section>;
}

export function PortfolioTable({ positions, markets, marketId, account, now, displayAmount, onSelect }: {
  positions: Position[]; markets: Deployment[]; marketId: string; account?: string; now: bigint;
  displayAmount: (value: bigint, token: Deployment["underlying"]) => string;
  onSelect: (address: string, marketId: string) => void;
}) {
  return <section className="positions-panel" aria-label="Positions"><table className="positions-table">
    <thead><tr>{["Market / Type", "Role", "Quantity", "Total premium", "Expiration", "Status", "Action"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{positions.map(position => {
      const id = "marketId" in position ? String(position.marketId) : marketId;
      const market = markets.find(m => m.marketId === id)!;
      const action = actions(position, account, now)[0];
      const label = action === "exercise" ? "Review exercise" : action === "cancel" ? "Review cancellation" : action === "reclaimExpired" ? "Review reclaim" : "View option";
      return <tr key={position.address}>
        <td data-label="Market / Type"><span>{market.underlying.symbol} <small>{position.optionType === 0 ? "CALL" : "PUT"} · {market.label}</small></span></td>
        <td data-label="Role">{position.writer.toLowerCase() === account?.toLowerCase() ? "Writer" : "Buyer"}</td>
        <td data-label="Quantity">{displayAmount(position.underlyingAmount, market.underlying)}</td>
        <td data-label="Total premium">{displayAmount(position.premium, market.quote)}</td>
        <td data-label="Expiration">{new Date(Number(position.expiry) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })}</td>
        <td data-label="Status"><span className="pill">{status(position, now)}</span></td>
        <td data-label="Action"><button className="text-button" data-offer={position.address} onClick={() => onSelect(position.address, id)}>{label} ↗</button></td>
      </tr>;
    })}</tbody>
  </table></section>;
}

export function ActivityTable({ transactions, explorer }: {
  transactions: TransactionRecord[]; explorer: (path: string, label: string) => ReactNode;
}) {
  return <section className="activity-panel"><h2>Activity</h2>
    <details className="history-source"><summary>Transactions from this browser · Status checked onchain</summary><p>Source: this browser + onchain receipts. Transactions from other devices are not included. Portfolio contains your onchain positions across configured markets.</p></details>
    {transactions.length ? <table className="activity-table"><thead><tr>{["Operation", "Market", "Status", "Transaction", "Time"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{transactions.map(tx => <tr key={tx.hash}>
      <td data-label="Operation"><span>{tx.action}<small className="term-label">{tx.step === "approval" ? "Token approval · no collateral deposited" : "Contract operation"}</small></span></td>
      <td data-label="Market">{tx.marketId}</td><td data-label="Status"><span className="pill">{tx.status}</span></td>
      <td data-label="Transaction">{explorer(`tx/${tx.hash}`, short(tx.hash))}</td>
      <td data-label="Time">{new Date(tx.createdAt).toLocaleString("en-US")}</td>
    </tr>)}</tbody></table> : <div className="empty">No transactions recorded for this wallet in this browser.</div>}
  </section>;
}
