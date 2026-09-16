"use client";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const documentation = [
  {
    "id": "overview",
    "title": "How it works",
    "paragraphs": [
      "Archer Markets offers fully collateralized calls and puts on Stock Tokens. Each agreement is one whole option with fixed terms. A call gives its holder the right to buy tokens; a put gives the right to sell tokens.",
      "Trade uses one bid/ask chain. Click an ask to buy or a bid to sell a new option. Buy / Sell posts your own price; acceptance is manual and always for the full quantity."
    ]
  },
  {
    "id": "buying",
    "title": "Buying an option",
    "paragraphs": [
      "Choose a market and click an Ask price. Review the full quantity, total premium and expiration, acknowledge manual exercise, then approve and buy. You receive an exercise right; the tokens move only if you exercise. The premium is not refundable."
    ]
  },
  {
    "id": "writing",
    "title": "Writing and collateral",
    "paragraphs": [
      "Choose Sell to post an ask. Enter a quantity in multiples of 0.1 token, total exercise payment, total premium and expiration. A call locks all the tokens; a put locks the full exercise payment. The premium arrives when someone buys. A sold option cannot be canceled."
    ]
  },
  {
    "id": "requests",
    "title": "Posting a bid",
    "paragraphs": [
      "Choose Buy to post a bid with your terms and reserve the premium. Set Accept until earlier than the option expiration. You do not own an option yet.",
      "A writer accepts the full request and deposits all collateral upfront. You receive one option and the writer receives your premium in the same transaction. Until acceptance, you can cancel for a full refund. After the acceptance deadline, recovery still requires a transaction."
    ]
  },
  {
    "id": "resale",
    "title": "Reselling your option",
    "paragraphs": [
      "Expand a purchased position in Portfolio to list the whole right at a total resale price. The payment goes to you; collateral and exercise terms stay unchanged. You can withdraw the listing or exercise until it sells. The previous holder loses the right after sale. Original-writer buybacks are not supported."
    ]
  },
  {
    "id": "manual-exercise",
    "title": "Manual American exercise",
    "paragraphs": [
      "American exercise means the holder may exercise any time before expiration. A call delivers the total payment to receive the tokens; a put delivers the tokens to receive the payment. Both transfers happen together.",
      "Keep the required funds, allowance and gas available. The transaction must execute before the onchain deadline. A reminder or pending transaction does not extend the right."
    ]
  },
  {
    "id": "expiration",
    "title": "Cancellation and expiration",
    "paragraphs": [
      "Writers can cancel unsold offers to recover collateral. After expiration, they must reclaim unused collateral manually and keep any paid premium. There is no automatic exercise, refund or payout."
    ]
  },
  {
    "id": "prices",
    "title": "Amounts and approvals",
    "paragraphs": [
      "Example: 0.2 tokens, 60 MockUSD exercise payment, 2 MockUSD premium. The strike is 300 per token, but exercising a call costs 60 in total, separately from the 2 paid to buy it. Rounded strike displays never change the agreed totals.",
      "An approval permits spending; the following transaction moves funds. Check the amount, spender and network in your wallet. Stock Tokens are token units, not direct shares; local mock assets have no real value."
    ]
  },
  {
    "id": "portfolio",
    "title": "Portfolio and Activity",
    "paragraphs": [
      "Portfolio shows available wallet balances, locked collateral, reserved request premiums and amounts awaiting recovery. Expand a position for its terms, actions and contract details. Total tracked is not a portfolio valuation.",
      "Positions come from the configured onchain markets. Activity tracks submissions from this browser only. Unknown balances display a dash."
    ]
  },
  {
    "id": "markets",
    "title": "Markets and availability",
    "paragraphs": [
      "Markets are selected by the platform and need a valid configured deployment to enable trading. Local Anvil uses mock assets. Robinhood Chain Testnet has no configured protocol deployment; the hosted frontend is not a funded contract demo. There are no partial fills, automatic matching or oracle settlement."
    ]
  }
];

export default function Docs({ onBack }: { onBack: () => void }) {
  return <div className="docs-layout"><nav className="docs-toc" aria-label="Documentation topics"><h2>On this page</h2>{documentation.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}<button className="text-button" onClick={onBack}>← Back to workspace</button></nav>
    <article className="docs-content"><div className="docs-hero"><span className="eyebrow">PLATFORM GUIDE</span><h2>A right today. A decision before expiration.</h2><p>Buy or sell → Hold or resell → Exercise before the deadline</p></div><p className="docs-intro">Understand each step before signing. This guide explains the product mechanics, not whether an option is a good trade.</p><div className="docs-comparison"><Table><TableHeader><TableRow><TableHead>Buyer’s right</TableHead><TableHead>Deliver at exercise</TableHead><TableHead>Receive at exercise</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Call · Buy tokens</TableCell><TableCell>Agreed total payment</TableCell><TableCell>Agreed token quantity</TableCell></TableRow><TableRow><TableCell>Put · Sell tokens</TableCell><TableCell>Agreed token quantity</TableCell><TableCell>Agreed total payment</TableCell></TableRow></TableBody></Table></div>{documentation.map(section => <section key={section.id} aria-labelledby={section.id}><h2 id={section.id} tabIndex={-1}>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}</article>
  </div>;
}
