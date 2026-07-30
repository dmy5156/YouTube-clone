import type { PrismaClient } from "@prisma/client";
import { parseDay } from "./dates";
import type { AnalyticsRow } from "@/youtube/types";

export async function upsertChannelAnalytics(prisma: PrismaClient, channelId: string, rows: readonly AnalyticsRow[]): Promise<void> {
  await prisma.$transaction(rows.map((row) => prisma.analyticsDaily.upsert({ where: { channelId_day: { channelId, day: parseDay(row.day) } }, update: { views: row.views, likes: row.likes, comments: row.comments, watchTime: row.watchTime, subscribersGained: row.subscribersGained ?? 0n, subscribersLost: row.subscribersLost ?? 0n, estimatedRevenue: row.estimatedRevenue ?? "0" }, create: { channelId, day: parseDay(row.day), views: row.views, likes: row.likes, comments: row.comments, watchTime: row.watchTime, subscribersGained: row.subscribersGained ?? 0n, subscribersLost: row.subscribersLost ?? 0n, estimatedRevenue: row.estimatedRevenue ?? "0" } })));
}
export async function upsertVideoAnalytics(prisma: PrismaClient, videoId: string, rows: readonly AnalyticsRow[]): Promise<void> {
  await prisma.$transaction(rows.map((row) => prisma.analyticsVideoDaily.upsert({ where: { videoId_day: { videoId, day: parseDay(row.day) } }, update: { views: row.views, likes: row.likes, comments: row.comments, watchTime: row.watchTime, averageViewDuration: row.averageViewDuration ?? 0n, estimatedRevenue: row.estimatedRevenue ?? "0" }, create: { videoId, day: parseDay(row.day), views: row.views, likes: row.likes, comments: row.comments, watchTime: row.watchTime, averageViewDuration: row.averageViewDuration ?? 0n, estimatedRevenue: row.estimatedRevenue ?? "0" } })));
}
