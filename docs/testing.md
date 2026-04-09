# Testing

## Commands
- `npm test`: unit and integration tests with Vitest.
- `npm run test:harness`: replayable workflow scenarios against fake adapters.
- `npm run dev`: starts the app so you can hit the live demo routes.

## Live test path
- Fill `.env` with real GitHub App credentials and `GROQ_API_KEY`.
- Set `AI_PROVIDER_MODE=groq`.
- Optionally set `SLACK_WEBHOOK_URL` and `DISCORD_WEBHOOK_URL`.
- Trigger:
  - a real GitHub `pull_request` webhook, or
  - `POST /api/demo/analyze-pr` manually.

## Implemented test coverage
- `packages/ai-core/src/utils.test.ts`
  - noisy file filtering
  - secret masking
  - file chunking
- `packages/ai-graph/src/graph.test.ts`
  - canonical brief generation
  - payload rendering
- `packages/workflows/src/workflow.test.ts`
  - end-to-end webhook processing
  - dedupe behavior

## Harness scenarios
- small PR
- large PR entering partial mode
- Slack delivery failure surface

## Extending the harness
- Add new fixtures in `packages/test-harness/src/fixtures/events.ts`
- Create scenario runners in `packages/test-harness/src/runAll.ts`
- Validate payload snapshots and analytics after each scenario
