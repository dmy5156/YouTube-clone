import { generateDateRange } from "./dates";
import type { AnalyticsRow } from "@/youtube/types";

const zeroRow = (day: string): AnalyticsRow => ({ day, views: 0n, likes: 0n, comments: 0n, watchTime: 0n, averageViewDuration: 0n, estimatedRevenue: "0", subscribersGained: 0n, subscribersLost: 0n });
export function fillMissingDates(rows: readonly AnalyticsRow[], startDate: string, endDate: string): AnalyticsRow[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return generateDateRange(startDate, endDate).map((day) => ({ ...zeroRow(day), ...byDay.get(day), day }));
}
