"use client";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const documentation = [
  {
    "id": "overview",
    "title": "Trading",
    "paragraphs": [
      "One V4 order trades one option covering one Stock Token. Click an ask to buy or a bid to sell; Buy/Sell opens the same limit ticket. Prices move in 0.01 increments."
    ]
  },
  {
    "id": "matching",
    "title": "Onchain matching",
    "paragraphs": [
      "The highest bid and lowest ask execute when their prices cross, at the resting price. Equal prices use oldest-first priority. Counts aggregate contracts at each price. There are no partial fills or batches. Self-trades and writer buybacks revert."
    ]
  },
  {
    "id": "collateral",
    "title": "Funds and collateral",
    "paragraphs": [
      "An unmatched buy reserves its limit premium. Selling a new call deposits one stock token; a put deposits the strike payment. Incoming premium cannot fund that deposit. Buying gives the exercise right, not immediate stock delivery."
    ]
  },
  {
    "id": "resale",
    "title": "Hold or resell",
    "paragraphs": [
      "In Portfolio, choose Sell owned option. The same ticket posts a resale into the same book. Its writer and collateral stay unchanged; payment goes to the holder selling it."
    ]
  },
  {
    "id": "manual-exercise",
    "title": "Manual exercise",
    "paragraphs": [
      "Before expiration, a call holder pays the strike to receive one stock token. A put holder delivers one token to receive the strike payment. Keep the required funds, allowance and gas ready. Premiums paid are not refundable."
    ]
  },
  {
    "id": "expiration",
    "title": "Cancellation and expiration",
    "paragraphs": [
      "Cancel an open bid for its reserved premium, or an unsold ask for its collateral. Removing a resale listing keeps your exercise right. Orders stop matching at expiration. Unused collateral and expired bid premiums require manual recovery."
    ]
  },
  {
    "id": "portfolio",
    "title": "Portfolio and availability",
    "paragraphs": [
      "Portfolio shows available funds, collateral, bids and positions; Activity tracks this browser\u2019s submissions. Local Anvil uses mock assets. Robinhood Chain Testnet is not deployed. Existing V1\u2013V3 positions retain their original terms and manual management."
    ]
  }
];

export default function Docs({ onBack }: { onBack: () => void }) {
  return <div className="docs-layout"><nav className="docs-toc" aria-label="Documentation topics"><h2>On this page</h2>{documentation.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}<button className="text-button" onClick={onBack}>← Back to workspace</button></nav>
    <article className="docs-content"><div className="docs-hero"><span className="eyebrow">PLATFORM GUIDE</span><h2>A right today. A decision before expiration.</h2><p>Buy or sell → Hold or resell → Exercise before the deadline</p></div><p className="docs-intro">Understand each step before signing. This guide explains the product mechanics, not whether an option is a good trade.</p><div className="docs-comparison"><Table><TableHeader><TableRow><TableHead>Buyer’s right</TableHead><TableHead>Deliver at exercise</TableHead><TableHead>Receive at exercise</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Call · Buy tokens</TableCell><TableCell>Agreed total payment</TableCell><TableCell>Agreed token quantity</TableCell></TableRow><TableRow><TableCell>Put · Sell tokens</TableCell><TableCell>Agreed token quantity</TableCell><TableCell>Agreed total payment</TableCell></TableRow></TableBody></Table></div>{documentation.map(section => <section key={section.id} aria-labelledby={section.id}><h2 id={section.id} tabIndex={-1}>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}</article>
  </div>;
}
