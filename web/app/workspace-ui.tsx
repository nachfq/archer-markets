"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AssetLogo, FontIcon } from "./asset-ui";
import { assetPresentation } from "../lib/catalog";
import type { Deployment } from "../lib/config";
import { actions, status, short, optionPayments, type Position } from "../lib/options";
import type { TransactionRecord } from "../lib/transactions";

export type WorkspaceTab = "market" | "create" | "mine" | "activity" | "docs" | "bids";

export function WorkspaceHeader({ tab, disabled, environment, wallet, onNavigate }: {
  tab: WorkspaceTab; disabled: boolean; environment: string; wallet: ReactNode; onNavigate: (tab: WorkspaceTab) => void;
}) {
  return <header className="topbar">
    <Link className="wordmark" href="/" aria-label="Archer Markets">Archer<span>Markets</span></Link>
    <nav className="tabs" aria-label="Sections">
      {([["market", "Trade"], ["mine", "Portfolio"], ["activity", "Activity"], ["docs", "Docs"]] as const).map(([key, label]) =>
        <button key={key} aria-current={tab === key || (key === "market" && (tab === "create" || tab === "bids")) ? "page" : undefined}
          className={tab === key || (key === "market" && (tab === "create" || tab === "bids")) ? "active" : ""} disabled={disabled} onClick={() => onNavigate(key)}>{label}</button>)}
    </nav>
    <span className="environment-badge">{environment} · Test funds only</span>
    {wallet}
  </header>;
}

export function WalletMenu({ label, children }: { label: string; children: ReactNode }) {
  return <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" />} aria-label="Wallet menu">{label} ▾</DropdownMenuTrigger><DropdownMenuContent className="wallet-dropdown" align="end">{children}</DropdownMenuContent></DropdownMenu>;
}

export function TradeTicket({ title, busy, onClose, children, inline = false }: {
  title: string; busy: boolean; onClose: () => void; children: ReactNode; inline?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (inline) return <section className="trade-ticket inline-ticket" aria-label="Trade ticket"><div className="ticket-heading"><h2>{title}</h2><Button variant="ghost" disabled={busy} onClick={onClose}>Close details</Button></div>{children}</section>;
  return <Drawer open modal={false} disablePointerDismissal onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DrawerContent className={`trade-sheet ${expanded ? "sheet-expanded" : ""}`} initialFocus={false} finalFocus={false}>
      <div className="sheet-handle" aria-hidden="true" />
      <div className="ticket-heading"><div><DrawerTitle>{title}</DrawerTitle><DrawerDescription>Whole option · Exact totals · Gas is separate</DrawerDescription></div><div className="sheet-controls"><Button variant="ghost" aria-label={expanded ? "Reduce panel height" : "Expand panel height"} onClick={() => setExpanded(!expanded)}>{expanded ? "Reduce" : "Expand"}</Button><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button></div></div>
      <ScrollArea className="sheet-body">{children}</ScrollArea>
    </DrawerContent>
  </Drawer>;
}

export function PortfolioTable({ positions, markets, marketId, account, now, displayAmount, onSelect, selected, detail, disabled }: {
  positions: Position[]; markets: Deployment[]; marketId: string; account?: string; now: bigint;
  displayAmount: (value: bigint, token: Deployment["underlying"]) => string;
  onSelect: (address: string | null, marketId: string) => void; selected: string | null; detail: ReactNode; disabled: boolean;
}) {
  // Keyboard users need to reach the horizontally scrollable table independently of row actions.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
  return <section className="positions-panel table-scroll" aria-label="Positions" tabIndex={0}><table className="positions-table">
    <thead><tr>{["Market / Type", "Role", "Token quantity", "Exercise payment — total", "Option payment — total", "Expiration", "Status", "Actions"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{positions.map(position => {
      const id = "marketId" in position ? String(position.marketId) : marketId;
      const market = markets.find(m => m.marketId === id)!;
      const action = actions(position, account, now)[0];
      const expanded = selected?.toLowerCase() === position.address.toLowerCase();
      const isWriter = position.writer.toLowerCase() === account?.toLowerCase();
      const isHolder = position.buyer.toLowerCase() === account?.toLowerCase();
      const payments = optionPayments(position, account);
      const label = action === "exercise" ? "Review exercise" : action === "cancel" ? "Review cancellation" : action === "reclaimExpired" ? "Review reclaim" : "View option";
      return <Fragment key={position.address}><tr className={expanded ? "expanded-position" : ""} onClick={() => { if (!disabled) onSelect(expanded ? null : position.address, id); }}>
        <td data-label="Market / Type"><div className="asset-cell"><AssetLogo presentation={assetPresentation(market, "underlying")} /><span>{market.underlying.symbol} <small>{position.optionType === 0 ? "CALL" : "PUT"} · {assetPresentation(market, "underlying").name}</small></span></div></td>
        <td data-label="Role">{isWriter ? "Writer" : isHolder ? "Holder" : "Past holder"}</td>
        <td data-label="Quantity">{displayAmount(position.underlyingAmount, market.underlying)}</td>
        <td data-label="Exercise payment — total">{displayAmount(position.strikeTotal, market.quote)}</td>
        <td data-label="Option payment — total">{Object.keys(payments).length ? Object.entries(payments).map(([kind, value]) => <span className="term-label" key={kind}>{kind === "paid" ? "Paid" : kind === "received" ? "Received" : "Asking price"} {displayAmount(value, market.quote)}</span>) : <span className="term-label">Not purchased · No payment</span>}</td>
        <td data-label="Expiration">{new Date(Number(position.expiry) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })}</td>
        <td data-label="Status"><span className="pill">{status(position, now)}</span></td>
        <td data-label="Actions"><button className="text-button" data-offer={position.address} disabled={disabled} aria-expanded={expanded} aria-controls={`position-${position.address}`} onClick={event => { event.stopPropagation(); onSelect(expanded ? null : position.address, id); }}>{expanded ? "Close details" : label} <FontIcon name="chevron-down" /></button></td>
      </tr>{expanded && <tr className="position-detail-row"><td colSpan={8}><div id={`position-${position.address}`}>{detail}</div></td></tr>}</Fragment>;
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
