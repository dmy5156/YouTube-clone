import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { YouTubeDataApi } from "@/youtube/data-api";
import { YouTubeAnalyticsApi } from "@/youtube/analytics-api";
import { ChannelRepository } from "@/db/repositories/channel-repository";
import { VideoRepository } from "@/db/repositories/video-repository";
import { fillMissingDates } from "@/helpers/analytics";
import { toDateKey } from "@/helpers/dates";
import { upsertChannelAnalytics, upsertVideoAnalytics } from "@/helpers/upsert";

export const fullChannelIngestion = inngest.createFunction({ id: "FullChannelIngestion", name: "FullChannelIngestion" }, { event: "channel/full-sync" }, async ({ event, step }) => {
  const userId = String(event.data.userId);
  const token = await step.run("load-token", () => prisma.oAuthToken.findUniqueOrThrow({ where: { userId_provider: { userId, provider: "google" } } }));
  const dataApi = new YouTubeDataApi(token.accessToken);
  const analyticsApi = new YouTubeAnalyticsApi(token.accessToken);
  const channel = await step.run("channels.list", () => dataApi.getAuthenticatedChannel());
  const dbChannel = await step.run("store-channel", () => new ChannelRepository(prisma).upsertForUser(userId, channel));
  const ids = channel.uploadsPlaylistId ? await step.run("playlistItems.list", () => dataApi.getUploadVideoIds(channel.uploadsPlaylistId)) : [];
  const videos = await step.run("videos.list", () => dataApi.getVideos(ids));
  await step.run("store-videos", () => new VideoRepository(prisma).upsertMany(dbChannel.id, videos));
  const startDate = toDateKey(channel.publishedAt ?? new Date()); const endDate = toDateKey(new Date());
  const channelRows = await step.run("channel-analytics", async () => fillMissingDates(await analyticsApi.getChannelDaily(channel.id, startDate, endDate), startDate, endDate));
  await step.run("upsert-channel-analytics", () => upsertChannelAnalytics(prisma, dbChannel.id, channelRows));
  const dbVideos = await step.run("load-db-videos", () => prisma.video.findMany({ where: { channelId: dbChannel.id }, select: { id: true, youtubeId: true, publishedAt: true } }));
  for (const video of dbVideos) { const videoStart = toDateKey(video.publishedAt ?? channel.publishedAt ?? new Date()); const rows = fillMissingDates(await analyticsApi.getVideoDaily(channel.id, video.youtubeId, videoStart, endDate), videoStart, endDate); await upsertVideoAnalytics(prisma, video.id, rows); }
  await step.run("history-and-state", () => prisma.channel.update({ where: { id: dbChannel.id }, data: { lastSyncedAt: new Date(), syncCompletedAt: new Date(), syncState: { upsert: { create: { lastFullSyncAt: new Date(), lastSuccessfulStep: "completed" }, update: { lastFullSyncAt: new Date(), lastSuccessfulStep: "completed" } } } } }));
  return { channelId: dbChannel.id, videos: videos.length };
});
