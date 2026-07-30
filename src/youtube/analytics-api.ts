import { google, youtubeAnalytics_v2 } from "googleapis";
import { retryWithBackoff } from "@/helpers/retry";
import { createOAuthClient } from "./oauth";
import type { AnalyticsRow } from "./types";

const metricList = "views,likes,comments,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost";
const toBig = (value: unknown): bigint => BigInt(Math.trunc(Number(value ?? 0)));
export class YouTubeAnalyticsApi { private readonly analytics: youtubeAnalytics_v2.Youtubeanalytics;
  constructor(accessToken: string) { const auth = createOAuthClient(); auth.setCredentials({ access_token: accessToken }); this.analytics = google.youtubeAnalytics({ version: "v2", auth }); }
  async getChannelDaily(channelYoutubeId: string, startDate: string, endDate: string): Promise<AnalyticsRow[]> { return this.queryDaily({ ids: `channel==${channelYoutubeId}`, startDate, endDate }); }
  async getVideoDaily(channelYoutubeId: string, videoYoutubeId: string, startDate: string, endDate: string): Promise<AnalyticsRow[]> { return this.queryDaily({ ids: `channel==${channelYoutubeId}`, filters: `video==${videoYoutubeId}`, startDate, endDate }); }
  private async queryDaily(params: { ids: string; filters?: string; startDate: string; endDate: string }): Promise<AnalyticsRow[]> { const res = await retryWithBackoff(() => this.analytics.reports.query({ ids: params.ids, startDate: params.startDate, endDate: params.endDate, dimensions: "day", metrics: metricList, filters: params.filters, sort: "day" })); return (res.data.rows ?? []).map((row) => ({ day: String(row[0]), views: toBig(row[1]), likes: toBig(row[2]), comments: toBig(row[3]), watchTime: toBig(row[4]), averageViewDuration: toBig(row[5]), subscribersGained: toBig(row[6]), subscribersLost: toBig(row[7]), estimatedRevenue: "0" })); }
}
