import { z } from "zod";
export const channelIdSchema = z.object({ channelId: z.string().min(1) });
export const videoIdSchema = z.object({ videoId: z.string().min(1) });
export const dateRangeSchema = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
