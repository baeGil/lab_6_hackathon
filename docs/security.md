# Security

## Current protections
- Secret masking runs before any provider call.
- Sensitive modules receive extra attention flags.
- Outputs are marked as AI-generated and framed as review aids, not approvals.
- Integration secrets are represented in `.env.example` and the architecture assumes application-layer encryption via `APP_MASTER_KEY`.

## Data retention
- The local scaffold stores events and analyses in memory only.
- The intended production policy is:
  - store metadata, findings and delivery logs
  - avoid storing raw diff long term
  - encrypt external integration tokens at rest

## Permissions model
- Intended model:
  - GitHub OAuth identifies the human user
  - GitHub App installation scopes repository access
  - only installation admins can change repository settings and routes

## Runbooks
- If secret masking fails, block provider invocation and mark the webhook run as failed.
- If provider output cannot be validated, store an audit entry and send a degraded fallback message.
- If a delivery adapter fails, log the failure, keep the analysis run and surface the error in activity/audit views.
