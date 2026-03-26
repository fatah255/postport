# Deployment

## Local Modes

### Remote Infra Mode

Use hosted Postgres/Redis/S3-compatible storage:

```bash
pnpm install
pnpm setup:remote
pnpm dev
```

### Docker Infra Mode

Use bundled local Postgres/Redis/MinIO:

```bash
pnpm install
pnpm setup:local
pnpm dev
```

## Runtime Commands

- `pnpm dev` starts web + api.
- `pnpm dev:all` starts web + api + worker.

## Required Env Notes

- `DATABASE_URL` must target PostgreSQL.
- `REDIS_URL` must be full URL with auth when needed.
  - Example: `rediss://default:<PASSWORD>@<HOST>:<PORT>`
- `S3_*` values must point to your storage endpoint/bucket.

## Scaling Guidance

- Scale web and api horizontally (stateless).
- Scale workers by queue pressure.
- Split worker pools by queue concerns for high-throughput workloads.

## CI

Pipeline should run:

1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm build`
4. `pnpm test`
