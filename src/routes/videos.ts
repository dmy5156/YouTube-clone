import { Router } from "express";
import { paginatedVideosSchema } from "@/helpers/validators";
import { prisma } from "@/lib/prisma";

export const videosRouter = Router();

videosRouter.get("/", async (request, response, next) => {
  try {
    const { channelId, cursor, limit } = paginatedVideosSchema.parse(request.query);
    const rows = await prisma.video.findMany({
      where: { channelId },
      include: { statistics: true },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
    });
    const hasNextPage = rows.length > limit;
    const videos = hasNextPage ? rows.slice(0, limit) : rows;
    response.json({ videos, pageInfo: { hasNextPage, nextCursor: hasNextPage ? videos.at(-1)?.id : null } });
  } catch (error) {
    next(error);
  }
});
