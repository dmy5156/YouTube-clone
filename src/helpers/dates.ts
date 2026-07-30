export const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);
export const parseDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
export function generateDateRange(start: string, end: string): string[] {
  const days: string[] = [];
  for (let cursor = parseDay(start); cursor <= parseDay(end); cursor.setUTCDate(cursor.getUTCDate() + 1)) days.push(toDateKey(cursor));
  return days;
}
export function calculateSyncRange(lastSyncedAt: Date | null | undefined, now = new Date()): { startDate: string; endDate: string } {
  const start = lastSyncedAt ? new Date(lastSyncedAt) : new Date(now);
  if (lastSyncedAt) start.setUTCDate(start.getUTCDate() + 1);
  return { startDate: toDateKey(start), endDate: toDateKey(now) };
}
