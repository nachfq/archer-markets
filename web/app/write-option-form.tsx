"use client";

import type { FormEvent, ReactNode } from "react";
import type { Token } from "../lib/config";
import { deadlinePreview, type suggestedExpirations } from "../lib/expirations";

export type WriteTerms = {
  kind: number; quantity: string; strike: string; premium: string;
  expiry: string; expiryMode: "suggested" | "custom"; presetExpiry: string;
};
type Props = {
  values: WriteTerms;
  onChange: { [K in keyof WriteTerms]: (value: WriteTerms[K]) => void };
  underlying: Token; quote: Token; busy: boolean; canMax: boolean; canReview: boolean;
  effectiveExpiry: string; suggestions: ReturnType<typeof suggestedExpirations>;
  onMax: () => void; onReview: (event: FormEvent) => void; children: ReactNode;
};

export default function WriteOptionForm({ values, onChange, underlying, quote, busy, canMax, canReview, effectiveExpiry, suggestions, onMax, onReview, children }: Props) {
  return <form onSubmit={onReview}>
    <div className="section-head"><div><div className="eyebrow">CREATE AN OFFER</div><h2>Write an option</h2></div><span className="pill">Fully collateralized</span></div>
    <div className="write-fields">
      <label className="field">Option type<select aria-label="Write option type" value={values.kind} onChange={event => onChange.kind(Number(event.target.value))} disabled={busy}><option value="0">Covered call</option><option value="1">Cash-secured put</option></select><small>You deposit {values.kind === 0 ? underlying.symbol : quote.symbol}.</small></label>
      <label className="field">Quantity of {underlying.symbol}<span className="lot-input"><input aria-label={`Quantity of ${underlying.symbol}`} inputMode="decimal" placeholder="0.5" value={values.quantity} onChange={event => onChange.quantity(event.target.value)} required disabled={busy} /><button className="button" type="button" disabled={busy || !canMax} onClick={onMax}>Max</button></span><small>Fixed token units · Full lot</small></label>
      <label className="field">Lot shortcut<select aria-label="Lot shortcut" value={["0.01", "1"].includes(values.quantity) ? values.quantity : "custom"} disabled={busy} onChange={event => { if (event.target.value !== "custom") onChange.quantity(event.target.value); }}><option value="custom">Custom quantity</option><option value="0.01">0.01 token</option><option value="1">1 token</option></select></label>
      <label className="field">Strike per token · {quote.symbol}<input inputMode="decimal" placeholder="100" value={values.strike} onChange={event => onChange.strike(event.target.value)} required disabled={busy} /></label>
      <label className="field">Premium per token · {quote.symbol}<input inputMode="decimal" placeholder="5" value={values.premium} onChange={event => onChange.premium(event.target.value)} required disabled={busy} /></label>
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
    <div className="form-actions"><small>Premium is received only when another trader buys your offer.</small><button className="button dark" type="submit" disabled={!canReview || busy}>Review offer →</button></div>
    <details className="contract-details"><summary>Token units and expiration rules</summary><p>Quantities are fixed token units, not adjusted share amounts. Suggested dates are Fridays at 4:00 PM New York time, with daylight saving applied. Monthly dates use the third Friday. These are protocol suggestions, not exchange-listed series; holidays and early closes are not adjusted.</p></details>
  </form>;
}
