import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { YouTubeDataApi } from "@/youtube/data-api";
import { YouTubeAnalyticsApi } from "@/youtube/analytics-api";
import { calculateSyncRange } from "@/helpers/dates";
import { fillMissingDates } from "@/helpers/analytics";
import { upsertChannelAnalytics, upsertVideoAnalytics } from "@/helpers/upsert";

export const dailyIncrementalSync = inngest.createFunction({ id: "DailyIncrementalSync", name: "DailyIncrementalSync" }, { cron: "0 3 * * *" }, async ({ step }) => {
  const channels = await step.run("load-channels", () => prisma.channel.findMany({ include: { user: { include: { tokens: true } }, videos: true } }));
  for (const channel of channels) {
    const token = channel.user.tokens.find((item) => item.provider === "google"); if (!token) continue;
    const dataApi = new YouTubeDataApi(token.accessToken); const analyticsApi = new YouTubeAnalyticsApi(token.accessToken); const { startDate, endDate } = calculateSyncRange(channel.lastSyncedAt);
    const ids = channel.uploadsPlaylistId ? await dataApi.getUploadVideoIds(channel.uploadsPlaylistId) : []; const known = new Set(channel.videos.map((v) => v.youtubeId)); const newVideos = await dataApi.getVideos(ids.filter((id) => !known.has(id)));
    await prisma.$transaction(newVideos.map((video) => prisma.video.upsert({ where: { youtubeId: video.id }, update: {}, create: { youtubeId: video.id, channelId: channel.id, title: video.title, description: video.description, publishedAt: video.publishedAt, tags: video.tags } })));
    await upsertChannelAnalytics(prisma, channel.id, fillMissingDates(await analyticsApi.getChannelDaily(channel.youtubeId, startDate, endDate), startDate, endDate));
    for (const video of channel.videos) await upsertVideoAnalytics(prisma, video.id, fillMissingDates(await analyticsApi.getVideoDaily(channel.youtubeId, video.youtubeId, startDate, endDate), startDate, endDate));
    await prisma.channel.update({ where: { id: channel.id }, data: { lastSyncedAt: new Date(), syncState: { upsert: { create: { lastDailySyncAt: new Date(), lastSuccessfulStep: "completed" }, update: { lastDailySyncAt: new Date(), lastSuccessfulStep: "completed" } } } } });
  }
  return { synced: channels.length };
});
