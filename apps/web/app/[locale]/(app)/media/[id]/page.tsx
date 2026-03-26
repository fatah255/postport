/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, CardDescription, CardTitle } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

interface MediaVariant {
  id: string;
  variantKind: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  publicUrl: string;
}

interface MediaThumbnail {
  id: string;
  width: number;
  height: number;
  publicUrl: string;
}

interface MediaDetails {
  id: string;
  originalFilename: string;
  normalizedFilename: string;
  mediaType: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  codec: string | null;
  bitrate: number | null;
  fps: number | null;
  storageKey: string;
  ffprobeJson: Record<string, unknown> | null;
  variants: MediaVariant[];
  thumbnails: MediaThumbnail[];
  createdAt: string;
}

export default function MediaDetailsPage() {
  const params = useParams<{ locale: string; id: string }>();
  const locale = params.locale ?? "en";
  const mediaId = params.id;
  const [item, setItem] = useState<MediaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<MediaDetails>(`/media/${mediaId}`);
        setItem(response);
      } catch (error) {
        if (error instanceof ApiError) {
          setError(error.message);
        } else {
          setError("Unable to load media details.");
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [mediaId]);

  if (loading) {
    return (
      <Card>
        <CardDescription>Loading media details...</CardDescription>
      </Card>
    );
  }

  if (error || !item) {
    return (
      <Card className="border-rose-300">
        <CardTitle>Media not available</CardTitle>
        <CardDescription className="mt-2">{error ?? "Could not find this media asset."}</CardDescription>
        <Link href={`/${locale}/media`} className="mt-4 inline-flex">
          <Button variant="secondary">Back to media library</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">{item.originalFilename}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {item.mediaType} | {item.status} | {formatBytes(item.sizeBytes)}
          </p>
        </div>
        <Link href={`/${locale}/media`}>
          <Button variant="secondary">Back</Button>
        </Link>
      </div>

      <Card>
        <CardTitle>Metadata</CardTitle>
        <div className="mt-3 grid gap-2 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-2">
          <p>MIME: {item.mimeType}</p>
          <p>Normalized: {item.normalizedFilename}</p>
          <p>Size: {formatBytes(item.sizeBytes)}</p>
          <p>Resolution: {item.width ?? "-"} x {item.height ?? "-"}</p>
          <p>Duration: {item.durationMs ? `${item.durationMs} ms` : "-"}</p>
          <p>FPS: {item.fps ?? "-"}</p>
          <p>Codec: {item.codec ?? "-"}</p>
          <p>Bitrate: {item.bitrate ?? "-"}</p>
          <p>Created: {new Date(item.createdAt).toLocaleString()}</p>
          <p className="truncate">Storage key: {item.storageKey}</p>
        </div>
      </Card>

      <Card>
        <CardTitle>Thumbnails</CardTitle>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {item.thumbnails.length === 0 ? (
            <CardDescription>No generated thumbnails yet.</CardDescription>
          ) : (
            item.thumbnails.map((thumb) => (
              <img key={thumb.id} src={thumb.publicUrl} alt="Thumbnail" className="h-36 w-full rounded-xl object-cover" />
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Variants</CardTitle>
        <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {item.variants.length === 0 ? (
            <CardDescription>No variants available.</CardDescription>
          ) : (
            item.variants.map((variant) => (
              <p key={variant.id}>
                {variant.variantKind} | {variant.mimeType} | {formatBytes(variant.sizeBytes)} | {variant.width ?? "-"} x{" "}
                {variant.height ?? "-"}
              </p>
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>ffprobe Summary</CardTitle>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
          {JSON.stringify(item.ffprobeJson ?? {}, null, 2)}
        </pre>
      </Card>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
