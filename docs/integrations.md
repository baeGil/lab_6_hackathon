# Integrations

## GitHub
- Live demo support:
  - GitHub App credentials from `.env`
  - webhook signature verification
  - PR file fetch through installation token
  - upsert one canonical PR comment and one canonical check run per PR
- Not yet implemented:
  - GitHub OAuth UI
  - GitHub App install UI in dashboard

## Slack
- Live demo support:
  - workspace webhook URL entered in `/integrations`
  - Block Kit-like realtime payload delivery
- Not yet implemented:
  - OAuth install flow
  - persistent channel routing UI

## Discord
- Live demo support:
  - workspace webhook URL entered in `/integrations`
  - embed delivery with semantic parity to Slack
- Not yet implemented:
  - bot install flow
  - persistent server/channel routing UI

## Local development model
- Fake mode:
  - POST a webhook fixture to `/api/webhooks/github`
  - review activity on `/`, `/repositories`, and `/analytics`
- Live mode:
  - point a real GitHub App webhook to `/api/webhooks/github`, or
  - call `/api/demo/analyze-pr` with a real repo and PR
  - configure Slack/Discord webhooks in `/integrations`
