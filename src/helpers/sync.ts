const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isSameUtcDay(left: Date, right: Date): boolean {
  return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

export function lastNDaysRange(days: number, now = new Date()): { start: Date; end: Date } {
  const end = startOfUtcDay(now);
  return { start: new Date(end.getTime() - (days - 1) * DAY_MS), end };
}
