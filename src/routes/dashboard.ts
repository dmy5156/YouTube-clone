import { Router } from "express";
import { channelIdSchema } from "@/helpers/validators";
import { prisma } from "@/lib/prisma";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (request, response, next) => {
  try {
    const { channelId } = channelIdSchema.parse(request.query);
    const [channel, recentAnalytics, videos] = await Promise.all([
      prisma.channel.findUnique({ where: { id: channelId }, include: { statistics: true } }),
      prisma.analyticsDaily.findMany({ where: { channelId }, orderBy: { day: "desc" }, take: 30 }),
      prisma.video.findMany({ where: { channelId }, include: { statistics: true }, orderBy: { publishedAt: "desc" }, take: 20 }),
    ]);
    response.json({ channel, recentAnalytics, videos });
  } catch (error) {
    next(error);
  }
});
