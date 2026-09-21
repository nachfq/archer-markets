"use client";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const topics = [
  { id: "overview", title: "The essentials" },
  { id: "manual-exercise", title: "Exercise" },
  { id: "trading", title: "Trading" },
  { id: "expiration", title: "After expiration" },
];

export default function Docs({ onBack }: { onBack: () => void }) {
  return <div className="docs-layout">
    <nav className="docs-toc" aria-label="Documentation topics">
      <h2>How it works</h2>
      {topics.map(topic => <a key={topic.id} href={`#${topic.id}`}>{topic.title}</a>)}
      <button className="text-button" onClick={onBack}>← Back to trading</button>
    </nav>
    <article className="docs-content">
      <div className="docs-hero"><span className="eyebrow">ARCHER MARKETS</span><h2>One option. One Stock Token.</h2><p>Each option is its own smart contract, backed by the asset its writer must deliver.</p></div>
      <section aria-labelledby="overview"><h2 id="overview" tabIndex={-1}>The essentials</h2>
        <div className="docs-principles">
          <div><strong>One Stock Token</strong><p>Every option covers exactly one token. Buying an option buys a right, not the token itself.</p></div>
          <div><strong>Your decision</strong><p>The holder can exercise any time before expiration. Nothing exercises automatically.</p></div>
          <div><strong>Collateral onchain</strong><p>A call contract holds the Stock Token; a put contract holds the strike payment. The holder supplies the other side when exercising.</p></div>
        </div>
      </section>
      <section aria-labelledby="manual-exercise"><h2 id="manual-exercise" tabIndex={-1}>Exercise</h2>
        <p>Go to Portfolio and choose Exercise before the deadline. You need the asset shown below, a token approval and network gas. The transaction must confirm before expiration.</p>
        <div className="docs-comparison"><Table><TableHeader><TableRow><TableHead>Option</TableHead><TableHead>You deliver</TableHead><TableHead>You receive</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Call</TableCell><TableCell>Strike payment</TableCell><TableCell>1 Stock Token</TableCell></TableRow><TableRow><TableCell>Put</TableCell><TableCell>1 Stock Token</TableCell><TableCell>Strike payment</TableCell></TableRow></TableBody></Table></div>
        <p>The premium and trading fee are separate from the exercise payment and are not refunded.</p>
      </section>
      <section aria-labelledby="trading"><h2 id="trading" tabIndex={-1}>Trading</h2>
        <p>Choose an ask to buy, a bid to sell, or set your own limit. Each order is for one option. A matching order executes onchain at the resting price; otherwise your order stays open.</p>
        <p>New sellers deposit collateral when posting. Buyers reserve their limit premium and maximum fee until the order executes or is canceled. The buyer fee on execution is 0.01 payment tokens plus 0.10% of the premium. An owner can resell an active option without changing its writer or collateral.</p>
      </section>
      <section aria-labelledby="expiration"><h2 id="expiration" tabIndex={-1}>After expiration</h2>
        <p>Unexercised rights expire. Open orders stop matching. Writers must reclaim unused collateral and buyers must recover expired bid funds themselves; neither withdrawal is automatic.</p>
        <p className="fine">Robinhood Chain Testnet uses test assets with no monetary value. Portfolio reads positions onchain; Activity lists transactions submitted from this browser.</p>
      </section>
    </article>
  </div>;
}
