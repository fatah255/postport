# Platform Adapters

## Contract

`packages/platform-sdk` defines `PlatformPublisherAdapter`:

- `validateConnection`
- `validateMedia`
- `mapDraftToPayload`
- `createRemoteContainerIfNeeded`
- `uploadOrReferenceMedia`
- `submitPublish`
- `pollStatus`
- `normalizeError`
- `refreshRemoteMetadata`

## Implemented Adapters

- `InstagramPublisher`
  - creates Instagram media containers
  - supports single image/video publishes and carousel assembly
  - waits for container processing, then calls `media_publish`
- `FacebookPublisher`
  - publishes Page photos via `/photos`
  - publishes Page videos via `/videos`
  - publishes Page Reels via `/video_reels` start/upload/finish flow
- `TikTokPublisher`
  - queries creator info before publish validation
  - supports direct video publish and upload-as-draft video flows through the Content Posting API
  - supports photo publishing through `/post/publish/content/init/`

## Implemented Provider Foundations

- Real Meta/TikTok OAuth connection start + callback flows in the API when provider env vars are configured.
- Encrypted token persistence via `OAuthCredential` + `TokenSecret`.
- Capability snapshots and connection health checks hydrated from provider metadata where available.
- Worker-side token resolution selects the correct user/page/profile credential per platform target before dispatch.
- Worker-side media resolution prefers normalized variants for video and signs short-lived download URLs for platform fetch/upload flows.
- Worker-side token refresh now sweeps expiring Meta/TikTok credentials and refreshes stored encrypted secrets automatically when provider env vars are configured.

Worker publish jobs call adapters through the shared contract and persist:

- publish attempts
- publish events
- normalized errors
- final job status (`SUCCEEDED`, `FAILED`, `NEEDS_REAUTH`, etc.)

## Product Rules Encoded

- Capability-first UI and draft target model
- TikTok `DIRECT` vs `DRAFT_UPLOAD` mode support in composer
- Instagram and Facebook feed-vs-reel selection in composer
- Explicit page/profile target selection in composer
- Normalized error categories for actionable retry/reauth UX

## Remaining Gaps

- TikTok photo publishing still depends on pull-from-URL, so production requires verified media-host ownership for that path.
- The adapter layer now runs real provider calls, but it still needs deeper contract/integration coverage beyond smoke tests.
