import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bootstrapLogin } from "@/services/login-service";
import { exchangeCodeForTokens, getGoogleAuthUrl, getGoogleProfile } from "@/youtube/oauth";

const callbackQuerySchema = z.object({ code: z.string().min(1) });
export const authRouter = Router();

authRouter.get("/start", (_request, response) => {
  response.redirect(getGoogleAuthUrl(randomUUID()));
});

authRouter.get("/callback", async (request, response, next) => {
  try {
    const { code } = callbackQuerySchema.parse(request.query);
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getGoogleProfile(tokens.accessToken);
    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: { name: profile.name, image: profile.image },
      create: { email: profile.email, name: profile.name, image: profile.image },
    });

    const storedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        tokens: {
          upsert: {
            where: { userId_provider: { userId: user.id, provider: "google" } },
            update: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, scopes: tokens.scopes },
            create: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, scopes: tokens.scopes },
          },
        },
      },
      include: { tokens: true },
    });

    response.json(await bootstrapLogin(prisma, storedUser));
  } catch (error) {
    next(error);
  }
});
