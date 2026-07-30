import { ChannelRepository } from "@/db/repositories/channel-repository";
import { VideoRepository } from "@/db/repositories/video-repository";
import { fillMissingDates } from "@/helpers/analytics";
import { chunkArray } from "@/helpers/batch";
import { toDateKey } from "@/helpers/dates";
import { upsertChannelAnalytics, upsertVideoAnalytics } from "@/helpers/upsert";
import { prisma } from "@/lib/prisma";
import { YouTubeAnalyticsApi } from "@/youtube/analytics-api";
import { YouTubeDataApi } from "@/youtube/data-api";
import { inngest } from "../client";

const VIDEO_ANALYTICS_CHUNK_SIZE = 25;

export const fullChannelIngestion = inngest.createFunction(
  { id: "FullChannelIngestion", name: "FullChannelIngestion" },
  { event: "channel/full-sync" },
  async ({ event, step }) => {
    const userId = String(event.data.userId);
    const token = await step.run("load-token", () =>
      prisma.oAuthToken.findUniqueOrThrow({ where: { userId_provider: { userId, provider: "google" } } }),
    );

    const dataApi = new YouTubeDataApi(token.accessToken);
    const analyticsApi = new YouTubeAnalyticsApi(token.accessToken);
    const channel = await step.run("channels.list", () => dataApi.getAuthenticatedChannel());
    const dbChannel = await step.run("store-channel", () => new ChannelRepository(prisma).upsertForUser(userId, channel));

    const uploadedVideoIds = channel.uploadsPlaylistId
      ? await step.run("playlistItems.list", () => dataApi.getUploadVideoIds(channel.uploadsPlaylistId))
      : [];
    const videos = await step.run("videos.list", () => dataApi.getVideos(uploadedVideoIds));
    await step.run("store-videos", () => new VideoRepository(prisma).upsertMany(dbChannel.id, videos));

    const startDate = toDateKey(channel.publishedAt ?? new Date());
    const endDate = toDateKey(new Date());
    const sparseChannelRows = await step.run("channel-analytics", () =>
      analyticsApi.getChannelDaily(channel.id, startDate, endDate),
    );
    const denseChannelRows = fillMissingDates(sparseChannelRows, startDate, endDate);
    await step.run("upsert-channel-analytics", () => upsertChannelAnalytics(prisma, dbChannel.id, denseChannelRows));

    const dbVideos = await step.run("load-db-videos", () =>
      prisma.video.findMany({
        where: { channelId: dbChannel.id },
        select: { id: true, youtubeId: true, publishedAt: true },
      }),
    );

    for (const [chunkIndex, videoChunk] of chunkArray(dbVideos, VIDEO_ANALYTICS_CHUNK_SIZE).entries()) {
      await step.run(`video-analytics-${chunkIndex}`, async () => {
        for (const video of videoChunk) {
          const videoStartDate = toDateKey(video.publishedAt ?? channel.publishedAt ?? new Date());
          const sparseRows = await analyticsApi.getVideoDaily(channel.id, video.youtubeId, videoStartDate, endDate);
          const denseRows = fillMissingDates(sparseRows, videoStartDate, endDate);
          await upsertVideoAnalytics(prisma, video.id, denseRows);
        }
      });
    }

    await step.run("history-and-state", () =>
      prisma.channel.update({
        where: { id: dbChannel.id },
        data: {
          lastSyncedAt: new Date(),
          syncCompletedAt: new Date(),
          syncState: {
            upsert: {
              create: { lastFullSyncAt: new Date(), lastSuccessfulStep: "completed" },
              update: { lastFullSyncAt: new Date(), lastSuccessfulStep: "completed" },
            },
          },
        },
      }),
    );

    return { channelId: dbChannel.id, videos: videos.length, denseChannelRows: denseChannelRows.length };
  },
);
