# YouTube Studio Clone Backend

Production-oriented Express + TypeScript backend for a YouTube Studio clone. The frontend reads this API only; YouTube Data API v3 and YouTube Analytics API calls are isolated to Inngest background jobs.

## Architecture

- Express exposes REST routes for auth, dashboards, video details, health checks, and Inngest webhooks.
- Prisma/PostgreSQL stores channels, videos, playlists, history snapshots, sync state, notifications, recommendations, and continuous analytics facts.
- Google OAuth stores access/refresh tokens and scopes for background ingestion.
- Inngest functions implement `FullChannelIngestion` and `DailyIncrementalSync`.
- Helpers batch video requests, paginate API calls, retry transient failures, calculate date ranges, and fill sparse Analytics API responses with zero-valued daily rows.

## API routes

- `GET /health` returns API health.
- `GET /api/auth/google/start` starts OAuth.
- `GET /api/auth/google/callback` stores tokens and emits `channel/full-sync`.
- `GET /api/dashboard?channelId=...` reads dashboard data from PostgreSQL.
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
