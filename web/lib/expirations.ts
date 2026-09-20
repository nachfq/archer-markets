export type ExpirySuggestion = {
  value: string;
  label: string;
  cadence: "Weekly" | "Monthly";
};

// Protocol presets inspired by equity options, not an exchange calendar.
// They intentionally do not shift for exchange holidays or early closes.
function newYorkClose(year: number, month: number, day: number): Date {
  const anchor = new Date(Date.UTC(year, month, day, 16));
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", hourCycle: "h23",
  }).format(anchor));
  return new Date(anchor.getTime() + (16 - hour) * 3_600_000);
}

export function suggestedExpirations(now: number): ExpirySuggestion[] {
  if (!Number.isFinite(now) || now <= 0) return [];
  const today = new Date(now);
  const dates = new Map<number, Date>();
  // Four upcoming Fridays plus the next three monthly expirations.
  for (let day = 0, count = 0; day < 36 && count < 4; day++) {
    const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + day));
    if (candidate.getUTCDay() !== 5) continue;
    const close = newYorkClose(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate());
    if (close.getTime() <= now) continue;
    dates.set(close.getTime(), close);
    count++;
  }
  for (let month = 0, count = 0; month < 5 && count < 3; month++) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + month, 1));
    const thirdFriday = 1 + ((5 - first.getUTCDay() + 7) % 7) + 14;
    const close = newYorkClose(first.getUTCFullYear(), first.getUTCMonth(), thirdFriday);
    if (close.getTime() <= now) continue;
    dates.set(close.getTime(), close);
    count++;
  }
  return [...dates.values()].sort((a, b) => a.getTime() - b.getTime()).map(date => ({
    value: date.toISOString(),
    label: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
    }).format(date),
    cadence: date.getUTCDate() >= 15 && date.getUTCDate() <= 21 ? "Monthly" : "Weekly",
  }));
}

export function utcDeadline(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function deadlinePreview(value: string): string | null {
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? utcDeadline(BigInt(Math.floor(milliseconds / 1000))) : null;
}
