import { Router } from "express";
import { videoIdSchema } from "@/helpers/validators";
import { prisma } from "@/lib/prisma";

export const videoRouter = Router();

videoRouter.get("/", async (request, response, next) => {
  try {
    const { videoId } = videoIdSchema.parse(request.query);
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        statistics: true,
        histories: { orderBy: { capturedAt: "desc" }, take: 30 },
        analyticsDaily: { orderBy: { day: "desc" }, take: 365 },
      },
    });
    response.json({ video });
  } catch (error) {
    next(error);
  }
});
