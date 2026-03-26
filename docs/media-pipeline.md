# Media Pipeline

## Implemented Flow

1. Client requests signed upload URL via `POST /media/upload/init`.
2. Client uploads directly to object storage using returned URL.
3. Client confirms upload with `POST /media/upload/complete`.
4. API verifies the object exists in storage, marks asset `PROCESSING`, and enqueues `media_ingest`.
5. Worker downloads the object from storage into a temp workspace.
6. Images are probed with `sharp`, thumbnailed to JPEG, and marked `READY`.
7. Videos are probed with `ffprobe`, thumbnailed with `ffmpeg`, and normalized to MP4 when needed.
8. Worker uploads derived thumbnails/variants back to object storage and stores metadata in Prisma.

## Multipart Flow

Large uploads can now use the multipart endpoints:

1. `POST /media/upload/multipart/init`
2. `POST /media/upload/multipart/part-url`
3. client uploads each part directly to object storage
4. `POST /media/upload/multipart/complete`
5. on failure, `POST /media/upload/multipart/abort`

The web uploader switches to multipart automatically for larger files instead of forcing every file through a single PUT request.

## Queues

- `media_ingest`
- `media_transcode` (reserved for future dedicated transcode fan-out)
- `thumbnail_generation` (reserved for future dedicated thumbnail fan-out)
- `housekeeping`

## Current Behavior

- Duplicate hints by checksum at upload init.
- Safe delete checks for READY/SCHEDULED draft references.
- Reprocess endpoint requeues ingest jobs.
- Failed probe/transcode steps mark the asset `FAILED` instead of pretending success.
- Publish jobs resolve the best media source per asset, preferring normalized video variants for downstream platform publishing.
- Worker-generated publish flows use short-lived signed download URLs when platforms need to fetch hosted media.

## Planned Enhancements

- Corrupt media detection and richer validation error normalization.
- Dedicated transcode and thumbnail queues for higher-throughput scaling.
