import { generateDateRange } from "./dates";
import type { AnalyticsRow } from "@/youtube/types";

export const ZERO_ANALYTICS_VALUES = {
  views: 0n,
  likes: 0n,
  comments: 0n,
  watchTime: 0n,
  averageViewDuration: 0n,
  estimatedRevenue: "0",
  subscribersGained: 0n,
  subscribersLost: 0n,
} as const;

export function createZeroAnalyticsRow(day: string): AnalyticsRow {
  return { day, ...ZERO_ANALYTICS_VALUES };
}

export function normalizeAnalyticsRow(row: Partial<AnalyticsRow> & { day: string }): AnalyticsRow {
  return {
    ...createZeroAnalyticsRow(row.day),
    ...row,
    views: row.views ?? 0n,
    likes: row.likes ?? 0n,
    comments: row.comments ?? 0n,
    watchTime: row.watchTime ?? 0n,
    averageViewDuration: row.averageViewDuration ?? 0n,
    estimatedRevenue: row.estimatedRevenue ?? "0",
    subscribersGained: row.subscribersGained ?? 0n,
    subscribersLost: row.subscribersLost ?? 0n,
  };
}

export function fillMissingDates(rows: readonly AnalyticsRow[], startDate: string, endDate: string): AnalyticsRow[] {
  const rowsByDay = new Map<string, AnalyticsRow>();

  for (const row of rows) {
    rowsByDay.set(row.day, normalizeAnalyticsRow(row));
  }

  return generateDateRange(startDate, endDate).map((day) => rowsByDay.get(day) ?? createZeroAnalyticsRow(day));
}
