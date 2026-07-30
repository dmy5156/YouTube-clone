import { Router } from "express";
import { channelIdSchema } from "@/helpers/validators";
import { lastNDaysRange } from "@/helpers/sync";
import { prisma } from "@/lib/prisma";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (request, response, next) => {
  try {
    const { channelId } = channelIdSchema.parse(request.query);
    const { start, end } = lastNDaysRange(30);
    const [channel, analyticsLast30Days, topPerformanceVideos, latestVideos] = await Promise.all([
      prisma.channel.findUnique({ where: { id: channelId }, include: { statistics: true, syncState: true } }),
      prisma.analyticsDaily.findMany({ where: { channelId, day: { gte: start, lte: end } }, orderBy: { day: "asc" } }),
      prisma.video.findMany({ where: { channelId }, include: { statistics: true }, orderBy: [{ statistics: { viewCount: "desc" } }, { publishedAt: "desc" }], take: 10 }),
      prisma.video.findMany({ where: { channelId }, include: { statistics: true }, orderBy: { publishedAt: "desc" }, take: 10 }),
    ]);
    response.json({ channel, analyticsLast30Days, topPerformanceVideos, latestVideos });
  } catch (error) {
    next(error);
  }
});
