import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { exchangeCodeForTokens, getGoogleAuthUrl } from "@/youtube/oauth";

const callbackQuerySchema = z.object({ code: z.string().min(1) });
export const authRouter = Router();

authRouter.get("/start", (_request, response) => {
  response.redirect(getGoogleAuthUrl(randomUUID()));
});

authRouter.get("/callback", async (request, response, next) => {
  try {
    const { code } = callbackQuerySchema.parse(request.query);
    const tokens = await exchangeCodeForTokens(code);
    const user = await prisma.user.upsert({
      where: { email: `google-user-${tokens.accessToken.slice(0, 8)}@example.local` },
      update: {},
      create: { email: `google-user-${tokens.accessToken.slice(0, 8)}@example.local` },
    });

    await prisma.oAuthToken.upsert({
      where: { userId_provider: { userId: user.id, provider: "google" } },
      update: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, scopes: tokens.scopes },
      create: { userId: user.id, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, scopes: tokens.scopes },
    });

    await inngest.send({ name: "channel/full-sync", data: { userId: user.id } });
    response.json({ userId: user.id, sync: "started" });
  } catch (error) {
    next(error);
  }
});
