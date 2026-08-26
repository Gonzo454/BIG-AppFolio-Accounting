---
name: End-to-end analytics testing for BIG Command Center
description: How to run the analytics ingest/read API and Usage card locally and what environment variables are required.
---

# End-to-end analytics testing

## Repos

- Dashboard: `/home/ubuntu/repos/BIG-Command-Center-App/dashboard`
- Mobile: `/home/ubuntu/repos/BIG-mobile-app`

## Start the dashboard locally

Run from `dashboard/`:

```bash
ANALYTICS_STORE=jsonl \
ANALYTICS_STORE_PATH=/home/ubuntu/analytics-test.jsonl \
ANALYTICS_API_TOKEN=dashboard-admin-token \
ANALYTICS_INGEST_TOKEN=mobile-ingest-token \
npm run dev
```

- Port: `3000`
- `ANALYTICS_API_TOKEN` and `ANALYTICS_INGEST_TOKEN` must be different.
- `ANALYTICS_STORE=jsonl` is the dev/CI fallback; `postgres` is required on Vercel.
- Do not set `VERCEL=1` with `ANALYTICS_STORE=jsonl` because the server returns 503.

## Endpoints

- `POST http://localhost:3000/api/analytics/track` — ingest. Accepts same-origin or `Authorization: Bearer <ANALYTICS_INGEST_TOKEN>`.
- `GET http://localhost:3000/api/analytics` — read. Requires `Authorization: Bearer <ANALYTICS_API_TOKEN>`.

## Common curl checks

```bash
# same-origin web event
curl -X POST http://localhost:3000/api/analytics/track \
  -H "Content-Type: application/json" \
  -H "Sec-Fetch-Site: same-origin" \
  -d '{"event":"screen_view","platform":"web","path":"/properties"}'

# mobile cross-origin event
curl -X POST http://localhost:3000/api/analytics/track \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mobile-ingest-token" \
  -d '{"event":"screen_view","platform":"ios","path":"/property/1609-landmark-drive"}'

# read stats
curl -H "Authorization: Bearer dashboard-admin-token" http://localhost:3000/api/analytics | jq .
```

## Usage card

The `UsageCard` is rendered on the Command Center homepage (`/`) via `src/app/page.tsx`. The homepage also calls `/api/command-center`, which requires AppFolio credentials, so the homepage may not load without them. For focused analytics testing, create a temporary `src/app/usage/page.tsx` that renders only `<UsageCard />`.

## Mobile app verification

If no iOS/Android simulator is available, simulate mobile ingest with curl using `platform: ios` and the dashboard's `ANALYTICS_INGEST_TOKEN`. The mobile code is in `src/lib/analytics.ts` and `src/components/AnalyticsProvider.tsx`.

## Forwarding (`after()`)

To verify `after()` fire-and-forget forwarding, start a local listener on a port such as `3001` and set `ANALYTICS_FORWARD_URL=http://localhost:3001/forward`. The forward uses `Authorization: Bearer <ANALYTICS_API_TOKEN>`.

## Devin Secrets Needed

- `APPFOLIO_CLIENT_ID`, `APPFOLIO_CLIENT_SECRET`, `APPFOLIO_DATABASE` (only if testing the full Command Center homepage; not needed for analytics API/Usage card isolation)
- `POSTGRES_URL` (only if testing Postgres store mode; otherwise use `ANALYTICS_STORE=jsonl`)
