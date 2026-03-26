/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, CardDescription, CardTitle, Input } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

type MediaType = "IMAGE" | "VIDEO" | "CAROUSEL";
type MediaStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | "DELETED";
type ViewMode = "grid" | "list";

interface MediaItem {
  id: string;
  mediaType: MediaType;
  status: MediaStatus;
  originalFilename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
  thumbnail: string | null;
  usageCount: number;
}

interface DuplicateHint {
  mediaAssetId: string;
  originalFilename: string;
  createdAt: string;
}

interface InitUploadResponse {
  mediaAsset: {
    id: string;
  };
  upload: {
    uploadUrl: string;
    strategy: "single_part";
  };
  duplicateHint: DuplicateHint | null;
}

interface InitMultipartUploadResponse {
  mediaAsset: {
    id: string;
  };
  upload: {
    uploadId: string;
    partSizeBytes: number;
    strategy: "multipart";
  };
  duplicateHint: DuplicateHint | null;
}

interface MultipartPartUrlResponse {
  uploadUrl: string;
}

interface MediaVariant {
  id: string;
  variantKind: string;
  mimeType: string;
  publicUrl: string;
}

interface MediaPreviewDetails {
  id: string;
  originalFilename: string;
  mediaType: MediaType;
  status: MediaStatus;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  variants: MediaVariant[];
  thumbnails: Array<{
    id: string;
    publicUrl: string;
  }>;
  ffprobeJson: Record<string, unknown> | null;
}

const statusOptions: Array<MediaStatus | "ALL"> = ["ALL", "UPLOADING", "PROCESSING", "READY", "FAILED"];
const typeOptions: Array<MediaType | "ALL"> = ["ALL", "IMAGE", "VIDEO", "CAROUSEL"];
const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" }
] as const;
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

export default function MediaPage() {
  const params = useParams<{ locale: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = params.locale ?? "en";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");
  const [type, setType] = useState<(typeof typeOptions)[number]>("ALL");
  const [sort, setSort] = useState<(typeof sortOptions)[number]["value"]>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadNotices, setUploadNotices] = useState<string[]>([]);
  const [preview, setPreview] = useState<MediaPreviewDetails | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoredSelectionKey, setRestoredSelectionKey] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim().length > 0) {
      params.set("query", query.trim());
    }
    if (status !== "ALL") {
      params.set("status", status);
    }
    if (type !== "ALL") {
      params.set("type", type);
    }
    params.set("sort", sort);
    return params.toString();
  }, [query, sort, status, type]);

  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
  const selectedReadyItems = useMemo(
    () => selectedItems.filter((item) => item.status === "READY"),
    [selectedItems]
  );
  const hasProcessingItems = useMemo(
    () => items.some((item) => item.status === "PROCESSING" || item.status === "UPLOADING"),
    [items]
  );
  const returnTo = searchParams.get("returnTo") || `/${locale}/drafts/new`;
  const incomingSelectedIds = useMemo(() => {
    const value = searchParams.get("selected");
    if (!value) {
      return [];
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }, [searchParams]);
  const incomingSelectedKey = incomingSelectedIds.join(",");
  const composerHref = useMemo(() => {
    if (selectedReadyItems.length === 0) {
      return returnTo;
    }

    const params = new URLSearchParams();
    params.set("media", selectedReadyItems.map((item) => item.id).join(","));
    return `${returnTo}?${params.toString()}`;
  }, [returnTo, selectedReadyItems]);

  const loadMedia = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ items: MediaItem[] }>(`/media${queryString ? `?${queryString}` : ""}`);
      setItems(response.items);
      setSelectedIds((previous) => previous.filter((id) => response.items.some((item) => item.id === id)));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load media assets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMedia();
  }, [queryString]);

  useEffect(() => {
    if (!hasProcessingItems) {
      return;
    }

    const interval = setInterval(() => {
      void loadMedia();
    }, 12_000);

    return () => clearInterval(interval);
  }, [hasProcessingItems, queryString]);

  useEffect(() => {
    if (loading || incomingSelectedIds.length === 0 || restoredSelectionKey === incomingSelectedKey) {
      return;
    }

    const matchingIds = incomingSelectedIds.filter((id) => items.some((item) => item.id === id));
    if (matchingIds.length > 0) {
      setSelectedIds((previous) => Array.from(new Set([...previous, ...matchingIds])));
    }
    setRestoredSelectionKey(incomingSelectedKey);
  }, [incomingSelectedIds, incomingSelectedKey, items, loading, restoredSelectionKey]);

  const onUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setUploading(true);
    setError(null);
    const notices: string[] = [];

    try {
      for (const file of Array.from(fileList)) {
        const validationError = validateUploadFile(file);
        if (validationError) {
          notices.push(`${file.name}: ${validationError}`);
          continue;
        }

        const duplicateHint =
          file.size >= MULTIPART_THRESHOLD_BYTES ? await uploadMultipartFile(file) : await uploadSingleFile(file);
        if (duplicateHint) {
          notices.push(
            `${file.name}: similar media already exists as ${duplicateHint.originalFilename} from ${new Date(duplicateHint.createdAt).toLocaleString()}.`
          );
        }
      }

      setUploadNotices(notices);
      await loadMedia();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onDelete = async (mediaAssetId: string) => {
    try {
      await apiRequest(`/media/${mediaAssetId}`, { method: "DELETE" });
      await loadMedia();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to delete media.");
    }
  };

  const onReprocess = async (mediaAssetId: string) => {
    try {
      await apiRequest(`/media/${mediaAssetId}/reprocess`, {
        method: "POST",
        body: "{}"
      });
      await loadMedia();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to enqueue reprocessing.");
    }
  };

  const onBulkDelete = async () => {
    if (selectedIds.length === 0) {
      setError("Select at least one media asset first.");
      return;
    }

    try {
      const response = await apiRequest<{
        deleted: number;
        failed: Array<{ mediaAssetId: string; reason: string }>;
      }>("/media/bulk-delete", {
        method: "POST",
        body: JSON.stringify({
          mediaAssetIds: selectedIds
        })
      });

      setUploadNotices([
        `Deleted ${response.deleted} selected asset(s).`,
        ...response.failed.map((item) => `${item.mediaAssetId}: ${item.reason}`)
      ]);
      setSelectedIds([]);
      await loadMedia();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Bulk delete failed.");
    }
  };

  const onBulkReprocess = async () => {
    if (selectedIds.length === 0) {
      setError("Select at least one media asset first.");
      return;
    }

    try {
      await Promise.all(
        selectedIds.map((mediaAssetId) =>
          apiRequest(`/media/${mediaAssetId}/reprocess`, {
            method: "POST",
            body: "{}"
          })
        )
      );

      setUploadNotices([`Queued ${selectedIds.length} asset(s) for reprocessing.`]);
      await loadMedia();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Bulk reprocess failed.");
    }
  };

  const openPreview = async (mediaAssetId: string) => {
    setPreviewLoading(true);
    setError(null);
    try {
      const details = await apiRequest<MediaPreviewDetails>(`/media/${mediaAssetId}`);
      setPreview(details);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load media preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const toggleSelected = (mediaAssetId: string) => {
    setSelectedIds((previous) =>
      previous.includes(mediaAssetId) ? previous.filter((id) => id !== mediaAssetId) : [...previous, mediaAssetId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(items.map((item) => item.id));
  };

  const openComposer = () => {
    router.push(composerHref);
  };

  const previewUrl = useMemo(() => {
    if (!preview) {
      return null;
    }

    return (
      preview.variants.find((variant) => variant.variantKind === "normalized")?.publicUrl ??
      preview.variants.find((variant) => variant.variantKind === "original")?.publicUrl ??
      preview.thumbnails[0]?.publicUrl ??
      null
    );
  }, [preview]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Media Library</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Direct uploads, processing status, previews, and bulk asset operations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={viewMode === "grid" ? "default" : "secondary"} onClick={() => setViewMode("grid")}>
            Grid view
          </Button>
          <Button variant={viewMode === "list" ? "default" : "secondary"} onClick={() => setViewMode("list")}>
            List view
          </Button>
        </div>
      </div>

      <Card
        className={`rounded-[28px] border-2 border-dashed transition-colors ${
          dragActive ? "border-sky-500 bg-sky-50/80 dark:bg-sky-950/20" : "border-slate-200 dark:border-slate-700"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void onUploadFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Drop files here or choose uploads</CardTitle>
            <CardDescription className="mt-2">
              Use direct-to-storage uploads for large image and video batches. Unsupported file types are rejected before upload.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(event) => void onUploadFiles(event.target.files)}
              disabled={uploading}
              data-testid="media-upload-input"
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="media-upload-trigger">
              {uploading ? "Uploading..." : "Choose files"}
            </Button>
            <Button variant="secondary" type="button" onClick={openComposer}>
              {selectedReadyItems.length > 0 ? `Use ${selectedReadyItems.length} selected in composer` : "New draft"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename..." />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {statusOptions.map((item) => (
              <option key={item} value={item}>
                Status: {item}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as (typeof typeOptions)[number])}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {typeOptions.map((item) => (
              <option key={item} value={item}>
                Type: {item}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as (typeof sortOptions)[number]["value"])}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {sortOptions.map((item) => (
              <option key={item.value} value={item.value}>
                Sort: {item.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {selectedItems.length > 0 ? (
        <Card className="border-slate-300 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{selectedItems.length} asset(s) selected</CardTitle>
              <CardDescription className="mt-1">
                {selectedReadyItems.length === selectedItems.length
                  ? "Ready assets can be sent straight into the composer."
                  : `${selectedReadyItems.length} of ${selectedItems.length} selected asset(s) are READY for drafting.`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" type="button" onClick={openComposer} disabled={selectedReadyItems.length === 0}>
                Use in composer
              </Button>
              <Button variant="secondary" onClick={() => void onBulkReprocess()}>
                Reprocess selected
              </Button>
              <Button variant="danger" onClick={() => void onBulkDelete()}>
                Delete selected
              </Button>
              <Button variant="ghost" onClick={() => setSelectedIds([])}>
                Clear selection
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>Media error</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      {uploadNotices.length > 0 ? (
        <Card className="space-y-2 border-sky-300">
          <CardTitle>Upload feedback</CardTitle>
          {uploadNotices.map((notice) => (
            <CardDescription key={notice}>{notice}</CardDescription>
          ))}
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardDescription>Loading media assets...</CardDescription>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardTitle>No media yet</CardTitle>
          <CardDescription className="mt-2">
            Upload images or videos to start building drafts and schedules.
          </CardDescription>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              {selectedIds.length === items.length ? "Clear all" : "Select all visible"}
            </button>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {items.length} asset(s) in view{hasProcessingItems ? " - auto-refresh enabled" : ""}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Card key={item.id} className="space-y-3">
                <div className="relative">
                  <label className="absolute left-3 top-3 z-10 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow dark:bg-slate-950/90">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="h-4 w-4"
                    />
                  </label>
                  {item.thumbnail ? (
                    <button type="button" className="w-full text-left" onClick={() => void openPreview(item.id)}>
                      <img src={item.thumbnail} alt={item.originalFilename} className="h-44 w-full rounded-xl object-cover" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex h-44 w-full items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500 dark:bg-slate-800"
                      onClick={() => void openPreview(item.id)}
                    >
                      No thumbnail
                    </button>
                  )}
                </div>

                <div>
                  <CardTitle className="truncate text-base">{item.originalFilename}</CardTitle>
                  <CardDescription className="mt-1">
                    {item.mediaType} | {item.status} | {formatBytes(item.sizeBytes)}
                  </CardDescription>
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400">
                  <p>
                    {item.width ?? "-"} x {item.height ?? "-"} {item.durationMs ? `| ${formatDuration(item.durationMs)}` : ""}
                  </p>
                  <p>Usage: {item.usageCount} draft(s)</p>
                  <p>Created: {new Date(item.createdAt).toLocaleString()}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void openPreview(item.id)}>
                    Preview
                  </Button>
                  <Link href={`/${locale}/media/${item.id}`}>
                    <Button variant="secondary">Details</Button>
                  </Link>
                  <Button variant="ghost" onClick={() => void onReprocess(item.id)}>
                    Reprocess
                  </Button>
                  <Button variant="danger" onClick={() => void onDelete(item.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50/90 dark:bg-slate-950/70">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === items.length}
                      onChange={toggleSelectAll}
                      aria-label="Select all media"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Asset</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Size</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Usage</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${item.originalFilename}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" className="text-left" onClick={() => void openPreview(item.id)}>
                        <p className="font-medium text-slate-900 dark:text-white">{item.originalFilename}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.mediaType} | {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.status}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatBytes(item.sizeBytes)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.usageCount} draft(s)</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => void openPreview(item.id)}>
                          Preview
                        </Button>
                        <Button variant="ghost" onClick={() => void onReprocess(item.id)}>
                          Reprocess
                        </Button>
                        <Button variant="danger" onClick={() => void onDelete(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {preview || previewLoading ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <Card className="max-h-[90vh] w-full max-w-4xl overflow-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{preview?.originalFilename ?? "Loading preview..."}</CardTitle>
                <CardDescription className="mt-1">
                  {preview
                    ? `${preview.mediaType} | ${preview.status} | ${formatBytes(preview.sizeBytes)}`
                    : "Loading media preview..."}
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>

            {previewLoading ? (
              <CardDescription className="mt-4">Loading preview...</CardDescription>
            ) : preview ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  {previewUrl ? (
                    preview.mediaType === "VIDEO" ? (
                      <video src={previewUrl} controls className="max-h-[420px] w-full rounded-2xl bg-slate-950" />
                    ) : (
                      <img src={previewUrl} alt={preview.originalFilename} className="max-h-[420px] w-full rounded-2xl object-contain bg-slate-100 dark:bg-slate-950" />
                    )
                  ) : (
                    <div className="flex h-72 items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-500 dark:bg-slate-950">
                      No preview available yet.
                    </div>
                  )}

                  {preview.thumbnails.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {preview.thumbnails.map((thumbnail) => (
                        <img
                          key={thumbnail.id}
                          src={thumbnail.publicUrl}
                          alt={`${preview.originalFilename} thumbnail`}
                          className="h-24 w-full rounded-xl object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                    <p>MIME: {preview.mimeType}</p>
                    <p>
                      Resolution: {preview.width ?? "-"} x {preview.height ?? "-"}
                    </p>
                    <p>Duration: {preview.durationMs ? formatDuration(preview.durationMs) : "-"}</p>
                    <p>Variants: {preview.variants.length}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Available files</p>
                    {preview.variants.length === 0 ? (
                      <CardDescription>No variants available yet.</CardDescription>
                    ) : (
                      preview.variants.map((variant) => (
                        <a
                          key={variant.id}
                          href={variant.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl border border-slate-200 p-3 text-sm text-slate-700 hover:border-sky-300 hover:text-sky-700 dark:border-slate-800 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:text-sky-300"
                        >
                          {variant.variantKind} - {variant.mimeType}
                        </a>
                      ))
                    )}
                  </div>

                  <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                    {JSON.stringify(preview.ffprobeJson ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

async function uploadSingleFile(file: File) {
  const init = await apiRequest<InitUploadResponse>("/media/upload/init", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size
    })
  });

  const uploadResponse = await fetch(init.upload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type
    },
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed for ${file.name}`);
  }

  await apiRequest("/media/upload/complete", {
    method: "POST",
    body: JSON.stringify({
      mediaAssetId: init.mediaAsset.id
    })
  });

  return init.duplicateHint;
}

async function uploadMultipartFile(file: File) {
  const init = await apiRequest<InitMultipartUploadResponse>("/media/upload/multipart/init", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size
    })
  });

  const parts: Array<{ partNumber: number; etag: string }> = [];
  const partCount = Math.ceil(file.size / init.upload.partSizeBytes);

  try {
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      const start = (partNumber - 1) * init.upload.partSizeBytes;
      const end = Math.min(file.size, start + init.upload.partSizeBytes);
      const chunk = file.slice(start, end);

      const signedPart = await apiRequest<MultipartPartUrlResponse>("/media/upload/multipart/part-url", {
        method: "POST",
        body: JSON.stringify({
          mediaAssetId: init.mediaAsset.id,
          uploadId: init.upload.uploadId,
          partNumber
        })
      });

      const response = await fetch(signedPart.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": file.type
        },
        body: chunk
      });

      if (!response.ok) {
        throw new Error(`Multipart upload failed on part ${partNumber} for ${file.name}`);
      }

      const etag = response.headers.get("etag") ?? response.headers.get("ETag");
      if (!etag) {
        throw new Error(`Multipart upload did not return an ETag for ${file.name}`);
      }

      parts.push({
        partNumber,
        etag
      });
    }

    await apiRequest("/media/upload/multipart/complete", {
      method: "POST",
      body: JSON.stringify({
        mediaAssetId: init.mediaAsset.id,
        uploadId: init.upload.uploadId,
        parts
      })
    });
  } catch (error) {
    await apiRequest("/media/upload/multipart/abort", {
      method: "POST",
      body: JSON.stringify({
        mediaAssetId: init.mediaAsset.id,
        uploadId: init.upload.uploadId
      })
    }).catch(() => undefined);
    throw error;
  }

  return init.duplicateHint;
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

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function validateUploadFile(file: File) {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return "Only images and videos are supported.";
  }

  if (file.size <= 0) {
    return "The selected file is empty.";
  }

  return null;
}
