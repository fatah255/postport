# Roadmap

## Current State

- Auth, sessions, workspaces, settings
- Media upload init/complete + real worker-side probe/thumbnail/normalization flow
- Draft composer flow with account/profile target selection and platform-specific publish format controls
- Capability-aware platform validation and connection health checks
- Publish job scheduling/dispatch/retry lifecycle with real provider-backed publish adapters
- Connections + connection health with real Meta/TikTok OAuth foundations when env is configured
- Dashboard, onboarding, media, drafts, calendar, history, settings UI routes with direct publish/schedule, bulk media actions, and calendar job inspection
- Playwright browser coverage for core V1 user journeys with deterministic API mocking
- Shared smoke tests for API, worker, SDK, and utilities

## Next Priority

1. Harden observability (metrics dashboards, tracing, Sentry wiring).
2. Add production deployment manifests and runbooks.
3. Deepen publish status sync and provider webhook handling where available.
4. Split media processing into dedicated high-throughput transcode/thumbnail fan-out queues.
5. Expand provider integration coverage beyond mocked browser journeys into full-stack staging tests.

## Known Gaps

- Worker requires valid authenticated `REDIS_URL` (`redis://` or `rediss://` with credentials).
- Production publish success depends on externally reachable object storage for provider media fetch/upload workflows.
- Real OAuth connections require provider app credentials and redirect URI configuration.
- Deeper API/worker integration suites are still lighter than the browser coverage and should continue to grow.
