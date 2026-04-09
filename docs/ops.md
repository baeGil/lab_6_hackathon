# Ops

## Free-tier deployment target
- `Vercel`: web app and API routes
- `Supabase`: Postgres
- `Inngest Cloud`: orchestration
- `Upstash`: dedupe and throttling cache
- `Sentry`: error tracking

## Health checks
- `GET /api/health`

## Suggested rollout
1. Deploy the Next.js app.
2. Connect observability.
3. Enable GitHub App webhook delivery.
4. Validate one repo in private beta.
5. Add Slack and Discord destinations.

## Operational metrics
- webhook events processed
- analysis runs completed
- average confidence
- attention distribution
- delivery failures by channel

## Known local/runtime gap
- The repository ships a local in-memory runtime to stay zero-cost and testable.
- Before real beta rollout, replace the store and fake adapters with live integrations.
