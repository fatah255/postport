"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardDescription, CardTitle } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

type Platform = "INSTAGRAM" | "FACEBOOK" | "TIKTOK";

interface PublishAttempt {
  id: string;
  status: string;
  attemptNumber: number;
  normalizedErrorKind: string | null;
  normalizedErrorMessage: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface PublishJob {
  id: string;
  platform: Platform;
  status: string;
  remotePublishId: string | null;
  remoteUrl: string | null;
  lastErrorKind: string | null;
  lastErrorMessage: string | null;
  runAt: string;
  updatedAt: string;
  attempts: PublishAttempt[];
}

const platformOptions: Array<Platform | "ALL"> = ["ALL", "INSTAGRAM", "FACEBOOK", "TIKTOK"];
const statusOptions = ["ALL", "SUCCEEDED", "FAILED", "NEEDS_REAUTH"] as const;

export default function PublishHistoryPage() {
  const [items, setItems] = useState<PublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<(typeof platformOptions)[number]>("ALL");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (platform !== "ALL") {
      params.set("platform", platform);
    }
    if (status !== "ALL") {
      params.set("status", status);
    }
    return params.toString();
  }, [platform, status]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ items: PublishJob[] }>(`/publish/history${queryString ? `?${queryString}` : ""}`);
      setItems(response.items);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Unable to load publish history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [queryString]);

  const retryJob = async (jobId: string) => {
    try {
      await apiRequest(`/publish/jobs/${jobId}/retry`, {
        method: "POST",
        body: "{}"
      });
      await loadHistory();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Failed to queue retry.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Publish History</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Track attempts, remote IDs, and normalized publish errors.</p>
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as (typeof platformOptions)[number])}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {platformOptions.map((value) => (
              <option key={value} value={value}>
                Platform: {value}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                Status: {value}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>History error</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardDescription>Loading publish history...</CardDescription>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardTitle>No publish history yet</CardTitle>
            <CardDescription className="mt-2">Queued and completed jobs will appear here.</CardDescription>
          </Card>
        ) : (
          items.map((job) => (
            <Card key={job.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {job.platform} | {job.status}
                </CardTitle>
                <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(job.updatedAt).toLocaleString()}</span>
              </div>

              <div className="grid gap-1 text-sm text-slate-600 dark:text-slate-300">
                <p>Run at: {new Date(job.runAt).toLocaleString()}</p>
                <p>Remote publish id: {job.remotePublishId ?? "Not available"}</p>
                <p>Remote URL: {job.remoteUrl ?? "Not available"}</p>
                <p>
                  Last error: {job.lastErrorKind ?? "none"} {job.lastErrorMessage ? `| ${job.lastErrorMessage}` : ""}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {job.attempts.length === 0 ? (
                  <p>No attempts yet.</p>
                ) : (
                  job.attempts.map((attempt) => (
                    <p key={attempt.id}>
                      Attempt #{attempt.attemptNumber} | {attempt.status} |{" "}
                      {attempt.normalizedErrorKind ? `${attempt.normalizedErrorKind}: ${attempt.normalizedErrorMessage ?? ""}` : "ok"}
                    </p>
                  ))
                )}
              </div>

              {(job.status === "FAILED" || job.status === "NEEDS_REAUTH" || job.status === "CANCELLED") && (
                <Button variant="secondary" onClick={() => void retryJob(job.id)}>
                  Retry job
                </Button>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
