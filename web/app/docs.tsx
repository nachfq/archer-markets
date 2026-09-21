"use client";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export default function Docs({ onBack }: { onBack: () => void }) {
  return <div className="docs-layout">
    <article className="docs-content">
      <button className="text-button docs-back" onClick={onBack}>← Back to trading</button>
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
        <p>Choose an ask to buy, a bid to sell, or enter a limit. A match executes onchain at the resting price; otherwise the order stays open.</p>
        <p>New sellers deposit collateral. Open buy orders reserve premium and maximum fee. On execution, the buyer fee is 0.01 payment tokens plus 0.10% of premium. Resales keep the same writer and collateral.</p>
      </section>
      <section aria-labelledby="expiration"><h2 id="expiration" tabIndex={-1}>After expiration</h2>
        <p>Unexercised rights expire. Open orders stop matching. Writers must reclaim unused collateral and buyers must recover expired bid funds themselves; neither withdrawal is automatic.</p>
        <p className="fine">Robinhood Chain Testnet uses test assets with no monetary value. Portfolio reads positions onchain; Activity lists transactions submitted from this browser.</p>
      </section>
    </article>
  </div>;
}
