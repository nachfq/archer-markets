"use client";

import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Token } from "../lib/config";
import { deadlinePreview, type suggestedExpirations } from "../lib/expirations";

export type WriteTerms = {
  kind: number; quantity: string; strike: string; premium: string;
  expiry: string; expiryMode: "suggested" | "custom"; presetExpiry: string;
};
type Props = {
  requestMode?: boolean;
  values: WriteTerms;
  onChange: { [K in keyof WriteTerms]: (value: WriteTerms[K]) => void };
  underlying: Token; quote: Token; busy: boolean; canMax: boolean; canReview: boolean;
  effectiveExpiry: string; suggestions: ReturnType<typeof suggestedExpirations>;
  onMax: () => void; onReview: (event: FormEvent) => void; children: ReactNode;
};

export default function WriteOptionForm({ requestMode = false, values, onChange, underlying, quote, busy, canMax, canReview, effectiveExpiry, suggestions, onMax, onReview, children }: Props) {
  return <form onSubmit={onReview}>
    <div className="section-head"><div><div className="eyebrow">{requestMode ? "FIND A WRITER" : "SET YOUR TERMS"}</div><h2>{requestMode ? "Request an option" : "Write an option"}</h2></div><span className="pill">{requestMode ? "Premium reserved" : "Fully collateralized"}</span></div>
    <div className="write-fields">
      <label className="field">Option type<select aria-label="Write option type" value={values.kind} onChange={event => onChange.kind(Number(event.target.value))} disabled={busy}><option value="0">Covered call</option><option value="1">Cash-secured put</option></select><small>{requestMode ? `You reserve the premium in ${quote.symbol}.` : `You deposit ${values.kind === 0 ? underlying.symbol : quote.symbol}.`}</small></label>
      <label className="field">Quantity of {underlying.symbol}<span className="lot-input"><Input aria-label={`Quantity of ${underlying.symbol}`} inputMode="decimal" placeholder="0.5" value={values.quantity} onChange={event => onChange.quantity(event.target.value)} required disabled={busy} />{!requestMode && values.kind === 0 && <Button variant="outline" type="button" disabled={busy || !canMax} onClick={onMax}>Max</Button>}</span><small>Multiples of 0.1 token. The complete quantity becomes one option.</small></label>
      <label className="field">Lot shortcut<select aria-label="Lot shortcut" value={["0.1", "1"].includes(values.quantity) ? values.quantity : "custom"} disabled={busy} onChange={event => { if (event.target.value !== "custom") onChange.quantity(event.target.value); }}><option value="custom">Custom quantity</option><option value="0.1">0.1 token</option><option value="1">1 token</option></select></label>
      <label className="field">Exercise payment — total · {quote.symbol}<Input inputMode="decimal" placeholder="185" value={values.strike} onChange={event => onChange.strike(event.target.value)} required disabled={busy} /><small>{requestMode ? (values.kind === 0 ? "You pay this amount later if you exercise." : "You receive this amount if you exercise and deliver the tokens.") : (values.kind === 0 ? "The buyer pays you this amount only if they exercise." : "You deposit this amount now; the buyer receives it if they exercise.")}</small>{!requestMode && values.kind === 1 && <Button variant="outline" type="button" disabled={busy || !canMax} onClick={onMax}>Use available collateral</Button>}</label>
      <label className="field">Option price — total · {quote.symbol}<Input inputMode="decimal" placeholder="8" value={values.premium} onChange={event => onChange.premium(event.target.value)} required disabled={busy} /><small>{requestMode ? "You reserve this amount now. A writer receives it only upon acceptance." : "You receive this amount when someone buys. Separate from exercise."}</small></label>
      <fieldset className="expiration-picker" disabled={busy}>
        <legend>Expiration</legend>
        <select aria-label="Write expiration" value={values.expiryMode === "custom" ? "custom" : effectiveExpiry} onChange={event => {
          onChange.expiryMode(event.target.value === "custom" ? "custom" : "suggested");
          if (event.target.value !== "custom") onChange.presetExpiry(event.target.value);
        }}>
          {suggestions.map(suggestion => <option key={suggestion.value} value={suggestion.value}>{suggestion.label} · {suggestion.cadence}</option>)}
          <option value="custom">Custom expiration…</option>
        </select>
        {values.expiryMode === "custom" && <label className="field">Expiration · your local time<input type="datetime-local" value={values.expiry} onChange={event => onChange.expiry(event.target.value)} required /></label>}
        {deadlinePreview(effectiveExpiry) && <p className="deadline-preview">Exercise before <strong>{deadlinePreview(effectiveExpiry)}</strong></p>}
      </fieldset>
    </div>
    {children}
    <div className="form-actions"><small>{requestMode ? "Full acceptance only. Cancel an unaccepted request to recover its premium." : "Premium is received only when another trader buys your offer."}</small><button className="button dark" type="submit" disabled={!canReview || busy}>{requestMode ? "Review request →" : "Review offer →"}</button></div>
    <details className="contract-details"><summary>Token units and expiration rules</summary><p>Quantities are fixed token units, not adjusted share amounts. Suggested dates are Fridays at 4:00 PM New York time, with daylight saving applied. Monthly dates use the third Friday. These are protocol suggestions, not exchange-listed series; holidays and early closes are not adjusted.</p></details>
  </form>;
}
