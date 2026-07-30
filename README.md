# YouTube Studio Clone Backend

Production-oriented Express + TypeScript backend for a YouTube Studio clone. The frontend reads this API only; YouTube Data API v3 and YouTube Analytics API calls are isolated to Inngest background jobs.

For the full backend and frontend implementation flow, see [`docs/IMPLEMENTATION_FLOW.md`](docs/IMPLEMENTATION_FLOW.md).

## Architecture

- Express exposes REST routes for auth, dashboards, video details, health checks, and Inngest webhooks.
- Prisma/PostgreSQL stores channels, videos, playlists, history snapshots, sync state, notifications, recommendations, and continuous analytics facts.
- Google OAuth stores access/refresh tokens and scopes for background ingestion.
- Inngest functions implement `FullChannelIngestion` and `DailyIncrementalSync`.
- Helpers batch video requests, paginate API calls, retry transient failures, calculate date ranges, and fill sparse Analytics API responses with zero-valued daily rows.

## API routes

- `GET /health` returns API health.
- `GET /api/auth/google/start` starts OAuth.
- `GET /api/auth/google/callback` stores tokens, immediately fetches authenticated channel metadata/statistics for first-login UX, returns that channel to the frontend, and then queues background ingestion. Returning users receive DB data when already synced today; otherwise the server refreshes channel metadata/new video metadata through YouTube Data API and queues daily analytics sync.
- `GET /api/dashboard?channelId=...` reads only PostgreSQL and returns channel metadata, 30 days of channel analytics, top-performing videos, and latest videos.
- `GET /api/videos?channelId=...&limit=25&cursor=...` returns paginated video metadata/statistics for the Videos screen.
- `GET /api/video?videoId=...` reads video details and analytics from PostgreSQL.
- `/api/inngest` serves Inngest functions for background jobs.

## Setup

1. Copy `.env.example` to `.env` and fill credentials.
2. Run `npm install`.
3. Run `npx prisma migrate dev`.
4. Run `npm run dev` for local development or `npm run build && npm start` for a compiled server.

## Design rules

- Frontend clients must never call YouTube APIs directly.
- Dashboard and video detail pages should read PostgreSQL tables only.
- Inngest jobs are the only code paths that call YouTube APIs.
- Analytics API sparse responses must pass through `fillMissingDates()` before UPSERT so missing days are stored as zero-valued rows, never `NULL`.


## API implementation notes

The server follows Google API guidance by paging collection endpoints with page tokens and batching video metadata lookups up to the YouTube Data API `videos.list` limit of 50 IDs per request. YouTube Analytics dashboard reports are retrieved with `reports.query`, which is intended for metrics over channel IDs/date ranges; because those responses can omit inactive dates, ingestion expands every requested date into a dense row before writing to PostgreSQL.
