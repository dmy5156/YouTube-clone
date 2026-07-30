import type { PrismaClient } from "@prisma/client";
import { chunkArray } from "./batch";
import { parseDay } from "./dates";
import { normalizeAnalyticsRow } from "./analytics";
import type { AnalyticsRow } from "@/youtube/types";

const ANALYTICS_UPSERT_BATCH_SIZE = 500;

export async function upsertChannelAnalytics(
  prisma: PrismaClient,
  channelId: string,
  rows: readonly AnalyticsRow[],
): Promise<void> {
  for (const batch of chunkArray(rows, ANALYTICS_UPSERT_BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((inputRow) => {
        const row = normalizeAnalyticsRow(inputRow);
        const day = parseDay(row.day);
        const data = {
          views: row.views,
          likes: row.likes,
          comments: row.comments,
          watchTime: row.watchTime,
          subscribersGained: row.subscribersGained,
          subscribersLost: row.subscribersLost,
          estimatedRevenue: row.estimatedRevenue,
        };

        return prisma.analyticsDaily.upsert({
          where: { channelId_day: { channelId, day } },
          update: data,
          create: { channelId, day, ...data },
        });
      }),
    );
  }
}

export async function upsertVideoAnalytics(
  prisma: PrismaClient,
  videoId: string,
  rows: readonly AnalyticsRow[],
): Promise<void> {
  for (const batch of chunkArray(rows, ANALYTICS_UPSERT_BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((inputRow) => {
        const row = normalizeAnalyticsRow(inputRow);
        const day = parseDay(row.day);
        const data = {
          views: row.views,
          likes: row.likes,
          comments: row.comments,
          watchTime: row.watchTime,
          averageViewDuration: row.averageViewDuration,
          estimatedRevenue: row.estimatedRevenue,
        };

        return prisma.analyticsVideoDaily.upsert({
          where: { videoId_day: { videoId, day } },
          update: data,
          create: { videoId, day, ...data },
        });
      }),
    );
  }
}
