import { fillMissingDates } from "@/helpers/analytics";
import { chunkArray } from "@/helpers/batch";
import { calculateSyncRange } from "@/helpers/dates";
import { upsertChannelAnalytics, upsertVideoAnalytics } from "@/helpers/upsert";
import { prisma } from "@/lib/prisma";
import { YouTubeAnalyticsApi } from "@/youtube/analytics-api";
import { YouTubeDataApi } from "@/youtube/data-api";
import { inngest } from "../client";

const CHANNEL_SYNC_CHUNK_SIZE = 10;
const VIDEO_ANALYTICS_CHUNK_SIZE = 25;

export const dailyIncrementalSync = inngest.createFunction(
  { id: "DailyIncrementalSync", name: "DailyIncrementalSync" },
  { cron: "0 3 * * *" },
  async ({ step }) => {
    const channels = await step.run("load-channels", () =>
      prisma.channel.findMany({ include: { user: { include: { tokens: true } }, videos: true } }),
    );

    for (const [channelChunkIndex, channelChunk] of chunkArray(channels, CHANNEL_SYNC_CHUNK_SIZE).entries()) {
      await step.run(`sync-channel-chunk-${channelChunkIndex}`, async () => {
        for (const channel of channelChunk) {
          const token = channel.user.tokens.find((item) => item.provider === "google");
          if (!token) continue;

          const dataApi = new YouTubeDataApi(token.accessToken);
          const analyticsApi = new YouTubeAnalyticsApi(token.accessToken);
          const { startDate, endDate } = calculateSyncRange(channel.lastSyncedAt);
          const uploadedVideoIds = channel.uploadsPlaylistId ? await dataApi.getUploadVideoIds(channel.uploadsPlaylistId) : [];
          const knownVideoIds = new Set(channel.videos.map((video) => video.youtubeId));
          const newVideos = await dataApi.getVideos(uploadedVideoIds.filter((id) => !knownVideoIds.has(id)));

          await prisma.$transaction(
            newVideos.map((video) =>
              prisma.video.upsert({
                where: { youtubeId: video.id },
                update: {},
                create: {
                  youtubeId: video.id,
                  channelId: channel.id,
                  title: video.title,
                  description: video.description,
                  publishedAt: video.publishedAt,
                  tags: video.tags,
                },
              }),
            ),
          );

          const sparseChannelRows = await analyticsApi.getChannelDaily(channel.youtubeId, startDate, endDate);
          await upsertChannelAnalytics(prisma, channel.id, fillMissingDates(sparseChannelRows, startDate, endDate));

          for (const videoChunk of chunkArray(channel.videos, VIDEO_ANALYTICS_CHUNK_SIZE)) {
            for (const video of videoChunk) {
              const sparseRows = await analyticsApi.getVideoDaily(channel.youtubeId, video.youtubeId, startDate, endDate);
              await upsertVideoAnalytics(prisma, video.id, fillMissingDates(sparseRows, startDate, endDate));
            }
          }

          await prisma.channel.update({
            where: { id: channel.id },
            data: {
              lastSyncedAt: new Date(),
              syncState: {
                upsert: {
                  create: { lastDailySyncAt: new Date(), lastSuccessfulStep: "completed" },
                  update: { lastDailySyncAt: new Date(), lastSuccessfulStep: "completed" },
                },
              },
            },
          });
        }
      });
    }

    return { synced: channels.length };
  },
);
