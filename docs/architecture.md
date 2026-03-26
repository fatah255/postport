# Architecture

## Design Principles

- Stateless API and web tiers
- Direct-to-storage uploads for large media
- Queue-driven asynchronous media/publish workflows
- Capability-driven platform adapter architecture
- Idempotent publish operations with durable attempt/event logs

## Services

- `apps/web`: Next.js App Router frontend with locale + RTL-ready structure
- `apps/api`: NestJS REST API with Prisma, auth, workspace access
- `apps/worker`: BullMQ worker service for background orchestration
- `postgres`: source of truth for domain entities
- `redis`: queue transport, scheduling, retries
- `object storage`: raw and processed media objects

## Core Flow

```mermaid
sequenceDiagram
  participant U as User
  participant W as Web
  participant A as API
  participant S as Object Storage
  participant Q as Queue
  participant K as Worker
  participant P as Platform

  U->>W: Upload media
  W->>A: Request signed upload URL
  A->>S: Create signed URL
  S-->>W: URL
  W->>S: Multipart upload
  W->>A: Upload complete callback
  A->>Q: Enqueue media_ingest
  Q->>K: Process media job
  K->>A: Update media status READY/FAILED
  U->>W: Schedule publish
  W->>A: Create publish jobs
  A->>Q: Enqueue publish_dispatch
  Q->>K: Dispatch publish job
  K->>P: Submit publish
  K->>A: Store attempts/events/status
```

## Data Ownership

- API owns writes to relational state
- Worker owns async state transitions with idempotency guarantees
- Object storage owns binary media
- Platform adapter layer owns external payload translation and error normalization
