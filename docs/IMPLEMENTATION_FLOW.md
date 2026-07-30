# YouTube Studio Clone Implementation Flow

This document describes how the Express backend is intended to work and how a frontend should integrate with it. The most important rule is that browser code must never call Google or YouTube APIs directly. Browser pages call this Express server, and the server reads dashboard data from PostgreSQL. Inngest background jobs are the only code paths that call the YouTube Data API or YouTube Analytics API.

## System Overview

```text
Frontend app
  |
  | REST requests for auth, dashboard, content, analytics, video detail
  v
Express API server
  |
  | PostgreSQL reads/writes through Prisma
  v
PostgreSQL

Inngest background jobs
  |
  | YouTube Data API v3 / YouTube Analytics API calls
  v
Google / YouTube APIs
  |
  | Dense analytics rows and metadata upserts
  v
PostgreSQL
```

## Backend Responsibilities

The backend owns:

- Google OAuth start and callback routes.
- Secure storage of access tokens, refresh tokens, expiry dates, and scopes.
- Channel, video, playlist, statistics, history, analytics, sync state, notifications, and recommendations persistence.
- Full channel ingestion after first login.
- Daily incremental synchronization.
- Sparse YouTube Analytics API response normalization.
- REST APIs that return PostgreSQL-backed dashboard data.
- Inngest webhook handling for background workflows.

The backend must not rely on frontend-triggered YouTube API reads for dashboard rendering.

## Frontend Responsibilities

The frontend owns:

- Rendering Google sign-in entry points.
- Redirecting users to `GET /api/auth/google/start`.
- Polling or querying sync status after OAuth callback.
- Rendering dashboard pages using server data only.
- Showing loading, empty, partial-sync, and failed-sync states.
- Providing user actions such as refresh requests, recommendation dismissal, or settings changes through backend routes.

Frontend code should not contain YouTube API keys, OAuth client secrets, or direct `youtube.googleapis.com` calls.

## Environment Variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `PORT` | Express | HTTP server port. |
| `CORS_ORIGIN` | Express | Comma-separated list of allowed frontend origins. |
| `DATABASE_URL` | Prisma | PostgreSQL connection string. |
| `GOOGLE_CLIENT_ID` | OAuth | Public Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | OAuth | Server-side Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | OAuth | Callback URL, for example `/api/auth/google/callback`. |
| `INNGEST_EVENT_KEY` | Inngest | Event signing/sending key. |
| `INNGEST_SIGNING_KEY` | Inngest | Webhook verification key. |
| `REDIS_URL` | Redis | Optional cache connection string. |

## Local Backend Setup

1. Copy `.env.example` to `.env`.
2. Fill Google OAuth credentials and `DATABASE_URL`.
3. Run `npm install`.
4. Run `npx prisma generate`.
5. Run `npx prisma migrate dev`.
6. Run `npm run dev`.
7. Verify `GET /health` returns `{ "ok": true }`.

For production builds, run `npm run build` and then `npm start`.

## Google OAuth Flow

1. Frontend renders a "Connect YouTube" button.
2. Button links to `GET /api/auth/google/start`.
3. Express redirects to Google with YouTube read-only and Analytics read-only scopes.
4. Google redirects back to `GET /api/auth/google/callback?code=...`.
5. The backend exchanges the code for access/refresh tokens.
6. The backend stores token data in `OAuthToken`.
7. The backend emits the `channel/full-sync` Inngest event.
8. The frontend should navigate the user to a sync progress page or dashboard loading state.

## First Login: Full Ingestion Flow

The `FullChannelIngestion` workflow runs after first login.

1. Load the Google OAuth token from PostgreSQL.
2. Call `channels.list` with `mine=true`.
3. Store channel metadata, branding, statistics, and uploads playlist ID.
4. Call `playlistItems.list` for the uploads playlist until `nextPageToken` is empty.
5. Collect all uploaded video IDs.
6. Call `videos.list` in batches of 50 IDs.
7. Upsert video metadata, tags, thumbnails, status, content details, and statistics.
8. Fetch channel-level daily analytics from channel publish date through today.
9. Convert sparse analytics into dense daily rows with `fillMissingDates()`.
10. Upsert all dense channel analytics records.
11. Load stored videos.
12. Fetch video-level daily analytics for each video.
13. Convert each video's sparse response into dense rows.
14. Upsert dense video analytics in transaction batches.
15. Update `lastSyncedAt`, `syncCompletedAt`, and `SyncState`.

## Daily Incremental Sync Flow

`DailyIncrementalSync` runs every 24 hours.

1. Load channels and associated OAuth tokens.
2. Calculate `startDate = lastSyncedAt + 1 day` and `endDate = today`.
3. Refresh uploaded video IDs from the uploads playlist.
4. Detect new video IDs not already present in PostgreSQL.
5. Fetch metadata for new videos only.
6. Fetch sparse channel analytics delta.
7. Fill missing dates with zero rows.
8. Upsert channel analytics delta.
9. Fetch sparse video analytics delta for existing videos.
10. Fill missing dates with zero rows.
11. Upsert video analytics delta.
12. Update `lastSyncedAt` and `SyncState`.

## Sparse Analytics Rule

The YouTube Analytics API omits dates where no metric value exists. The database must not store sparse date series.

For every requested analytics range:

- Generate every date from `startDate` through `endDate`.
- Build a lookup map from YouTube rows by date.
- For each generated date:
  - If YouTube returned data, persist those values.
  - If YouTube omitted the date, persist a row with zero values.
- Never store `NULL` for numeric analytics metrics.
- Always use UPSERT so retries and reruns are idempotent.

Example:

```text
Requested range: 2026-07-01 to 2026-07-05
YouTube rows:    2026-07-01, 2026-07-03
DB rows:         2026-07-01, 2026-07-02, 2026-07-03, 2026-07-04, 2026-07-05
```

Dates `2026-07-02`, `2026-07-04`, and `2026-07-05` should be stored with `views = 0`, `likes = 0`, `comments = 0`, and `watchTime = 0`.

## REST API Contract

### `GET /health`

Returns server health.

```json
{ "ok": true }
```

### `GET /api/auth/google/start`

Redirects the browser to Google OAuth.

Frontend usage:

```ts
window.location.href = `${API_BASE_URL}/api/auth/google/start`;
```

### `GET /api/auth/google/callback`

Google redirects here after OAuth consent. The backend stores tokens and starts full ingestion.

Response:

```json
{
  "userId": "user_id",
  "sync": "started"
}
```

### `GET /api/dashboard?channelId=...`

Returns channel summary, recent analytics, and recent videos. This route reads PostgreSQL only.

Recommended frontend usage:

```ts
const response = await fetch(`${API_BASE_URL}/api/dashboard?channelId=${channelId}`);
const dashboard = await response.json();
```

### `GET /api/video?videoId=...`

Returns video metadata, statistics, history, and up to one year of stored daily analytics. This route reads PostgreSQL only.

Recommended frontend usage:

```ts
const response = await fetch(`${API_BASE_URL}/api/video?videoId=${videoId}`);
const video = await response.json();
```

### `/api/inngest`

Inngest webhook endpoint mounted through the Express adapter. This endpoint is called by Inngest, not by frontend pages.

## Recommended Frontend Page Flow

### 1. Landing / Connect Page

- Show product overview.
- Show a "Connect YouTube" button.
- On click, redirect to `/api/auth/google/start`.

### 2. OAuth Callback Handling

The backend currently returns JSON from the callback. A production frontend can either:

- Open OAuth in the same tab and have the backend redirect to a frontend route after token storage, or
- Open OAuth in a popup and post a completion message back to the opener.

After OAuth completes, show a sync progress state.

### 3. Sync Progress Page

The frontend should display:

- "Connecting channel"
- "Importing videos"
- "Backfilling analytics"
- "Preparing dashboard"

A production implementation should add a `GET /api/sync-state?channelId=...` endpoint that reads `SyncState` and `SyncJob` from PostgreSQL. Until that endpoint exists, the frontend can show a generic loading state and retry dashboard reads.

### 4. Dashboard Page

- Call `GET /api/dashboard?channelId=...`.
- Render total views, subscribers, video count, recent 30-day chart, and recent videos.
- Do not call YouTube APIs from chart components.
- If analytics are empty while sync is running, show a partial-data message.

### 5. Content Page

Recommended backend endpoint to add next:

```text
GET /api/content?channelId=...&cursor=...&limit=50
```

This should query `Video` and `VideoStatistics` from PostgreSQL and support cursor pagination for millions of videos.

### 6. Analytics Page

Recommended backend endpoint to add next:

```text
GET /api/analytics/channel?channelId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
GET /api/analytics/video?videoId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

These should query dense rows from `AnalyticsDaily` and `AnalyticsVideoDaily`.

### 7. Playlists Page

Recommended backend endpoint to add next:

```text
GET /api/playlists?channelId=...
GET /api/playlists/:playlistId/videos?cursor=...&limit=50
```

These should query `Playlist` and `PlaylistVideo`.

### 8. Video Details Page

- Call `GET /api/video?videoId=...`.
- Render metadata, current statistics, historical snapshots, and dense daily analytics.
- If the requested date range is missing in PostgreSQL, the frontend should request a backend sync endpoint rather than calling YouTube directly.

### 9. Recommendations Page

Recommended backend endpoint to add next:

```text
GET /api/recommendations?channelId=...
POST /api/recommendations/:id/dismiss
```

These should read and update `Recommendation` rows.

### 10. Settings Page

Recommended backend endpoint to add next:

```text
GET /api/settings/channel?channelId=...
POST /api/settings/channel?channelId=...
```

This should expose local application settings and sync metadata, not raw OAuth secrets.

## Scalable Frontend Data Practices

- Use server-side pagination for content lists.
- Use date ranges for analytics queries.
- Cache dashboard reads briefly on the frontend, but treat PostgreSQL as the source of truth.
- Render partial sync states instead of blocking the entire app until every historical video is complete.
- Use virtualized tables for large video libraries.
- Never load millions of videos into the browser at once.

## Scalable Backend Practices

- Use batched `videos.list` calls with 50 IDs per request.
- Use paginated playlist fetches.
- Use delta syncs after the initial sync.
- Use idempotent UPSERTs for analytics and metadata.
- Fill sparse analytics dates before persistence.
- Keep analytics unique constraints on `(channelId, day)` and `(videoId, day)`.
- Process large backfills in chunks.
- Store `SyncState` so workflows can resume from the latest successful point.
- Add dedicated endpoints for sync status and manual refresh before exposing advanced frontend controls.

## Suggested Frontend Folder Structure

```text
frontend/
  src/
    api/
      client.ts
      dashboard.ts
      video.ts
      sync.ts
    components/
      charts/
      layout/
      tables/
    pages/
      ConnectPage.tsx
      SyncProgressPage.tsx
      DashboardPage.tsx
      ContentPage.tsx
      AnalyticsPage.tsx
      PlaylistsPage.tsx
      VideoDetailsPage.tsx
      RecommendationsPage.tsx
      SettingsPage.tsx
    state/
      auth-store.ts
      channel-store.ts
    types/
      api.ts
```

## Minimal Frontend API Client Example

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function getDashboard(channelId: string) {
  const response = await fetch(`${API_BASE_URL}/api/dashboard?channelId=${channelId}`);
  if (!response.ok) throw new Error("Failed to load dashboard");
  return response.json();
}

export async function getVideo(videoId: string) {
  const response = await fetch(`${API_BASE_URL}/api/video?videoId=${videoId}`);
  if (!response.ok) throw new Error("Failed to load video");
  return response.json();
}
```

## Production Hardening Checklist

- Replace placeholder user creation in OAuth callback with verified Google profile identity.
- Encrypt OAuth tokens at rest.
- Add session management or JWT auth for frontend API calls.
- Add sync status endpoints.
- Add content, analytics, playlists, comments, revenue, settings, and recommendations endpoints.
- Add queue fan-out for very large video analytics backfills.
- Add structured logging and metrics.
- Add unit tests for `fillMissingDates()` and date range helpers.
- Add integration tests for dashboard/video routes.
- Add rate limiting to public API routes.
- Add database migration SQL generated from Prisma rather than the current placeholder migration stub.

## Updated login and dashboard contract

### First login

1. The OAuth callback exchanges the Google authorization code for tokens.
2. The backend fetches the authenticated Google profile to create or update the local `User`.
3. The backend immediately calls `channels.list?mine=true` server-side, stores the channel metadata/statistics, and returns `{ user, channel, isFirstLogin: true, sync: "started" }` to the frontend.
4. The expensive work (uploads playlist pagination, batched `videos.list`, playlist mappings, historical channel analytics, and historical video analytics) is queued with the `channel/full-sync` Inngest event and runs in the background.
5. The frontend can route directly to a dashboard shell using the returned channel metadata while showing sync-progress placeholders for charts/videos until background rows arrive.

### Returning login

1. If the user's channel has `lastSyncedAt` on the current UTC day, the OAuth callback returns the existing PostgreSQL channel data without calling YouTube data endpoints again.
2. If `lastSyncedAt` is missing or from a previous UTC day, the server refreshes channel metadata/statistics and detects newly uploaded videos from the uploads playlist before returning.
3. The server then queues `channel/daily-sync` so channel/video analytics deltas are filled and upserted asynchronously.

### Dashboard response shape

`GET /api/dashboard?channelId=...` intentionally returns only the data required by the dashboard landing page:

- `channel`: channel metadata, current statistics, and sync state.
- `analyticsLast30Days`: exactly the stored daily channel analytics rows for the last 30 UTC days.
- `topPerformanceVideos`: the top 10 videos by stored view count.
- `latestVideos`: the latest 10 videos by publish date.

This keeps the first dashboard payload small even for channels with millions of videos.

### Videos screen response shape

`GET /api/videos?channelId=...&limit=25&cursor=...` returns a cursor-paginated list:

```json
{
  "videos": [],
  "pageInfo": {
    "hasNextPage": true,
    "nextCursor": "video_table_id"
  }
}
```

The frontend should request the next page with `cursor=pageInfo.nextCursor`, render rows with virtualization for large libraries, and never request all videos at once.

### Internet/API references used for this design

- Google documents that `videos.list` accepts up to 50 items per request, which is why video metadata is batched instead of fetched one by one.
- Google documents that YouTube Analytics `reports.query` takes channel/content-owner IDs, date ranges, metrics, dimensions, and filters, which matches the server-side dashboard and video analytics ingestion model.
- Collection reads use page-token pagination because YouTube list endpoints return bounded pages rather than complete large collections in one response.
