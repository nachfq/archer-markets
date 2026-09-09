import test from "node:test";
import assert from "node:assert/strict";
import { suggestedExpirations, utcDeadline, deadlinePreview } from "../lib/expirations.ts";

test("presets offer future Fridays and three distinct monthly dates in chronological order", () => {
  const now = Date.parse("2026-09-09T12:00:00Z");
  const suggestions = suggestedExpirations(now);
  assert.equal(suggestions[0].value, "2026-09-11T20:00:00.000Z");
  assert.equal(new Set(suggestions.map(s => s.value)).size, suggestions.length);
  assert.deepEqual(suggestions.filter(s => s.cadence === "Monthly").map(s => s.value), [
    "2026-09-18T20:00:00.000Z", "2026-10-16T20:00:00.000Z", "2026-11-20T21:00:00.000Z",
  ]);
  for (let i = 0; i < suggestions.length; i++) {
    assert.equal(new Date(suggestions[i].value).getUTCDay(), 5);
    assert.ok(Date.parse(suggestions[i].value) > (i ? Date.parse(suggestions[i - 1].value) : now));
  }
});

test("16:00 New York presets track daylight saving changes", () => {
  const spring = suggestedExpirations(Date.parse("2026-03-01T00:00:00Z"));
  assert.equal(spring[0].value, "2026-03-06T21:00:00.000Z");
  assert.equal(spring[1].value, "2026-03-13T20:00:00.000Z");
  const fall = suggestedExpirations(Date.parse("2026-10-29T00:00:00Z"));
  assert.equal(fall[0].value, "2026-10-30T20:00:00.000Z");
  assert.equal(fall[1].value, "2026-11-06T21:00:00.000Z");
});

test("exact cutoff is excluded and monthly presets roll across years", () => {
  const suggestions = suggestedExpirations(Date.parse("2026-12-18T21:00:00Z"));
  assert.equal(suggestions[0].value, "2026-12-25T21:00:00.000Z");
  assert.equal(suggestions.find(s => s.cadence === "Monthly")?.value, "2027-01-15T21:00:00.000Z");
  assert.deepEqual(suggestedExpirations(0), []);
  assert.deepEqual(suggestedExpirations(NaN), []);
});

test("deadline displays preserve the stored timestamp and explicit timezone", () => {
  assert.equal(utcDeadline(1893456001n), "2030-01-01 00:00:01 UTC");
  assert.equal(deadlinePreview("2030-01-01T01:00:00+01:00"), "2030-01-01 00:00:00 UTC");
  assert.equal(deadlinePreview(""), null);
  assert.equal(deadlinePreview("invalid"), null);
});
