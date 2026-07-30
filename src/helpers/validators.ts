import { z } from "zod";
export const channelIdSchema = z.object({ channelId: z.string().min(1) });
export const videoIdSchema = z.object({ videoId: z.string().min(1) });
export const paginatedVideosSchema = z.object({ channelId: z.string().min(1), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });
