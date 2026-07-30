import type { Channel, OAuthToken, PrismaClient, User } from "@prisma/client";
import { ChannelRepository } from "@/db/repositories/channel-repository";
import { VideoRepository } from "@/db/repositories/video-repository";
import { inngest } from "@/inngest/client";
import { isSameUtcDay } from "@/helpers/sync";
import { YouTubeDataApi } from "@/youtube/data-api";
import { refreshAccessToken } from "@/youtube/oauth";

type UserWithToken = User & { tokens: OAuthToken[] };

type LoginBootstrapResult = {
  user: Pick<User, "id" | "email" | "name" | "image">;
  channel: Channel;
  isFirstLogin: boolean;
  sync: "started" | "queued" | "fresh";
};

async function ensureFreshToken(prisma: PrismaClient, token: OAuthToken): Promise<OAuthToken> {
  if (token.expiresAt.getTime() > Date.now() + 60_000) return token;
  if (!token.refreshToken) throw new Error("Google refresh token is missing; reconnect Google OAuth.");
  const refreshed = await refreshAccessToken(token.refreshToken);
  return prisma.oAuthToken.update({
    where: { id: token.id },
    data: { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt, scopes: refreshed.scopes },
  });
}

export async function bootstrapLogin(prisma: PrismaClient, user: UserWithToken): Promise<LoginBootstrapResult> {
  const googleToken = user.tokens.find((token) => token.provider === "google");
  if (!googleToken) throw new Error("Google OAuth token not found.");

  const existingChannel = await prisma.channel.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const freshToken = await ensureFreshToken(prisma, googleToken);

  if (!existingChannel) {
    const dataApi = new YouTubeDataApi(freshToken.accessToken);
    const youtubeChannel = await dataApi.getAuthenticatedChannel();
    const channel = await new ChannelRepository(prisma).upsertForUser(user.id, youtubeChannel);
    await prisma.channelStatistics.upsert({ where: { channelId: channel.id }, update: youtubeChannel.statistics, create: { channelId: channel.id, ...youtubeChannel.statistics } });
    await inngest.send({ name: "channel/full-sync", data: { userId: user.id, channelId: channel.id } });
    return { user, channel, isFirstLogin: true, sync: "started" };
  }

  if (!existingChannel.lastSyncedAt || !isSameUtcDay(existingChannel.lastSyncedAt, new Date())) {
    const dataApi = new YouTubeDataApi(freshToken.accessToken);
    const youtubeChannel = await dataApi.getAuthenticatedChannel();
    const channel = await new ChannelRepository(prisma).upsertForUser(user.id, youtubeChannel);
    await prisma.channelStatistics.upsert({ where: { channelId: channel.id }, update: youtubeChannel.statistics, create: { channelId: channel.id, ...youtubeChannel.statistics } });

    if (youtubeChannel.uploadsPlaylistId) {
      const uploadedVideoIds = await dataApi.getUploadVideoIds(youtubeChannel.uploadsPlaylistId);
      const knownVideoIds = new Set((await prisma.video.findMany({ where: { channelId: channel.id }, select: { youtubeId: true } })).map((video) => video.youtubeId));
      const newVideoIds = uploadedVideoIds.filter((videoId) => !knownVideoIds.has(videoId));
      if (newVideoIds.length > 0) await new VideoRepository(prisma).upsertMany(channel.id, await dataApi.getVideos(newVideoIds));
    }

    await inngest.send({ name: "channel/daily-sync", data: { channelId: channel.id } });
    return { user, channel, isFirstLogin: false, sync: "queued" };
  }

  return { user, channel: existingChannel, isFirstLogin: false, sync: "fresh" };
}
