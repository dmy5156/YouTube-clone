import { google, youtubeAnalytics_v2 } from "googleapis";
import { retryWithBackoff } from "@/helpers/retry";
import { normalizeAnalyticsRow } from "@/helpers/analytics";
import { createOAuthClient } from "./oauth";
import type { AnalyticsRow } from "./types";

const DAILY_METRICS = [
  "views",
  "likes",
  "comments",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "subscribersGained",
  "subscribersLost",
] as const;

const toBigIntMetric = (value: unknown): bigint => BigInt(Math.trunc(Number(value ?? 0)));

export class YouTubeAnalyticsApi {
  private readonly analytics: youtubeAnalytics_v2.Youtubeanalytics;

  constructor(accessToken: string) {
    const auth = createOAuthClient();
    auth.setCredentials({ access_token: accessToken });
    this.analytics = google.youtubeAnalytics({ version: "v2", auth });
  }

  async getChannelDaily(channelYoutubeId: string, startDate: string, endDate: string): Promise<AnalyticsRow[]> {
    return this.queryDaily({ ids: `channel==${channelYoutubeId}`, startDate, endDate });
  }

  async getVideoDaily(
    channelYoutubeId: string,
    videoYoutubeId: string,
    startDate: string,
    endDate: string,
  ): Promise<AnalyticsRow[]> {
    return this.queryDaily({
      ids: `channel==${channelYoutubeId}`,
      filters: `video==${videoYoutubeId}`,
      startDate,
      endDate,
    });
  }

  private async queryDaily(params: {
    ids: string;
    filters?: string;
    startDate: string;
    endDate: string;
  }): Promise<AnalyticsRow[]> {
    const response = await retryWithBackoff(() =>
      this.analytics.reports.query({
        ids: params.ids,
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: "day",
        metrics: DAILY_METRICS.join(","),
        filters: params.filters,
        sort: "day",
      }),
    );

    return (response.data.rows ?? []).map((row) =>
      normalizeAnalyticsRow({
        day: String(row[0]),
        views: toBigIntMetric(row[1]),
        likes: toBigIntMetric(row[2]),
        comments: toBigIntMetric(row[3]),
        watchTime: toBigIntMetric(row[4]),
        averageViewDuration: toBigIntMetric(row[5]),
        subscribersGained: toBigIntMetric(row[6]),
        subscribersLost: toBigIntMetric(row[7]),
        estimatedRevenue: "0",
      }),
    );
  }
}
