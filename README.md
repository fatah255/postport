# PostPort

PostPort is a media library and social publishing SaaS scaffold for Instagram, Facebook Pages, and TikTok.

## What Is Implemented

- Monorepo with `pnpm` workspaces + Turborepo
- `apps/web` (Next.js App Router, Tailwind, locale routing, dark mode)
- `apps/api` (NestJS + Fastify, auth, workspaces, media, drafts, publish, settings, connections)
- `apps/worker` (BullMQ worker with media/publish processors)
- Prisma schema + migration + seed
- Direct-to-storage upload flow (signed URL init + upload complete callback with storage existence check)
- Multipart upload flow for large files, including part signing, completion, and abort cleanup
- Draft creation, scheduling, publish job queueing, publish history/retry endpoints
- Capability-aware connection health and draft validation for Instagram/Facebook/TikTok rules
- OAuth-ready connection flow for Meta/TikTok with encrypted token storage and safe mock fallback
- Worker-based media processing with real image metadata, video probing, thumbnails, and optional normalized MP4 variants
- Real worker publish adapters for Instagram Graph publishing, Facebook Page photo/video/reel publishing, and TikTok Content Posting API publish flows
- Remote publish polling with retry requeueing for long-running platform processing states
- Worker-side token refresh sweep for expiring Meta/TikTok credentials
- Composer controls for platform target profile selection and feed-vs-reel publish format selection
- Shared platform-rule helpers with automated smoke tests for API, worker, SDK, and utils

## Apps

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- API Docs: `http://localhost:3001/docs`

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL + Redis + S3-compatible storage

For local infra, Docker Compose is provided. For cloud infra, use your own DB/Redis/storage endpoints in `.env`.

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Fill required values.

Important Redis format:

- `REDIS_URL` must include scheme and auth when required.
- Example: `rediss://default:<PASSWORD>@<HOST>:<PORT>`

Note:

- `SESSION_COOKIE_NAME` can be any safe cookie key, e.g. `postport_session`.
- For real platform publishing, object storage must be reachable by Meta/TikTok. Local MinIO + `localhost` is fine for development/mocks, but production must use a public S3/R2-compatible endpoint or equivalent.

## Quick Start (Cloud/Remote Infra)

```bash
pnpm install
pnpm setup:remote
pnpm dev
```

Then open `http://localhost:3000/en/login`.

## Quick Start (Local Docker Infra)

```bash
pnpm install
pnpm setup:local
pnpm dev
```

If Docker is unavailable, use `setup:remote` with hosted services.

## Dev Scripts

- `pnpm dev` -> starts web + api (recommended default)
- `pnpm dev:all` -> starts web + api + worker
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm db:generate`
- `pnpm db:migrate:deploy`
- `pnpm db:seed`

## E2E Coverage

Playwright browser coverage lives under `tests/e2e` and runs against a clean local Next.js server with mocked API responses for reliable UI journey verification.

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## Seeded User

After `pnpm db:seed`:

- Email: `admin@postport.local`
- Password: `postport123!`

## Notes

- `pnpm dev` intentionally excludes worker so UI/API can run even if Redis worker credentials are not ready.
- Use `pnpm dev:all` once Redis auth is correctly configured.
- For real token refresh in the worker, populate `META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, and `TIKTOK_CLIENT_SECRET` in the worker environment too.
