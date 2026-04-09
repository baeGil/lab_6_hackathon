# API

## Implemented endpoints
### `GET /api/health`
- returns platform status and current in-memory analytics snapshot

### `POST /api/webhooks/github`
- accepts a `WebhookEvent` payload shaped like:

```json
{
  "deliveryId": "uuid",
  "receivedAt": "2026-04-09T12:00:00.000Z",
  "snapshot": {
    "repoId": "repo-1",
    "repoName": "demo/repo",
    "prNumber": 42,
    "title": "Tighten auth token validation",
    "author": "alice",
    "url": "https://github.com/demo/repo/pull/42",
    "baseBranch": "main",
    "headBranch": "feature/auth",
    "eventType": "opened",
    "labels": ["security"],
    "reviewers": ["bob"],
    "files": []
  }
}
```

- also accepts a real GitHub `pull_request` webhook payload when `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and optionally `GITHUB_WEBHOOK_SECRET` are configured.

### `POST /api/demo/analyze-pr`
- triggers a live PR analysis without waiting for an external webhook

```json
{
  "owner": "your-org",
  "repo": "your-repo",
  "pullNumber": 123,
  "installationId": 456789
}
```

## Planned production endpoints
- GitHub OAuth start/callback
- GitHub App install callback
- Slack OAuth start/callback
- Discord interaction endpoint
- repository settings and analytics APIs
