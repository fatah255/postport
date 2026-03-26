"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardDescription, CardTitle } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

interface PublishJob {
  id: string;
  status: string;
  platform: string;
  runAt: string;
  draft: {
    id: string;
    title: string | null;
    caption: string | null;
  };
}

interface PublishJobDetails extends PublishJob {
  remotePublishId: string | null;
  remoteUrl: string | null;
  lastErrorKind: string | null;
  lastErrorMessage: string | null;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    normalizedErrorKind: string | null;
    normalizedErrorMessage: string | null;
    startedAt: string;
    endedAt: string | null;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    message: string | null;
    createdAt: string;
  }>;
}

type ViewMode = "month" | "week";

export default function CalendarPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "en";
  const [items, setItems] = useState<PublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedJob, setSelectedJob] = useState<PublishJobDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [acting, setActing] = useState(false);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, PublishJob[]>();
    for (const job of items) {
      const key = toDateKey(new Date(job.runAt));
      const existing = map.get(key) ?? [];
      existing.push(job);
      map.set(key, existing);
    }
    return map;
  }, [items]);

  const visibleDays = useMemo(() => (viewMode === "month" ? monthDays(cursorDate) : weekDays(cursorDate)), [cursorDate, viewMode]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ items: PublishJob[] }>("/publish/jobs");
      setItems(response.items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load scheduled jobs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 20_000);
    return () => clearInterval(interval);
  }, []);

  const loadJobDetails = async (jobId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const response = await apiRequest<PublishJobDetails>(`/publish/jobs/${jobId}`);
      setSelectedJob(response);
      setRescheduleValue(toDateTimeLocalValue(response.runAt));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load publish job details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const moveCursor = (direction: "prev" | "next") => {
    setCursorDate((previous) => {
      const next = new Date(previous);
      if (viewMode === "month") {
        next.setMonth(previous.getMonth() + (direction === "next" ? 1 : -1));
      } else {
        next.setDate(previous.getDate() + (direction === "next" ? 7 : -7));
      }
      return next;
    });
  };

  const cancelJob = async () => {
    if (!selectedJob) return;
    setActing(true);
    try {
      await apiRequest(`/publish/jobs/${selectedJob.id}/cancel`, { method: "POST", body: "{}" });
      await Promise.all([load(), loadJobDetails(selectedJob.id)]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to cancel publish job.");
    } finally {
      setActing(false);
    }
  };

  const retryJob = async () => {
    if (!selectedJob) return;
    setActing(true);
    try {
      await apiRequest(`/publish/jobs/${selectedJob.id}/retry`, { method: "POST", body: "{}" });
      await Promise.all([load(), loadJobDetails(selectedJob.id)]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to retry publish job.");
    } finally {
      setActing(false);
    }
  };

  const rescheduleJob = async () => {
    if (!selectedJob || !rescheduleValue) {
      setError("Choose a new schedule time first.");
      return;
    }
    setActing(true);
    try {
      await apiRequest(`/drafts/${selectedJob.draft.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({
          scheduledAt: new Date(rescheduleValue).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      await Promise.all([load(), loadJobDetails(selectedJob.id)]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to reschedule the draft.");
    } finally {
      setActing(false);
    }
  };

  const title =
    viewMode === "month"
      ? cursorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${(visibleDays[0] ?? cursorDate).toLocaleDateString()} - ${(visibleDays[visibleDays.length - 1] ?? cursorDate).toLocaleDateString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Scheduled Calendar</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Month and week views for queued publish jobs, with inspect and reschedule controls.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={viewMode === "month" ? "default" : "secondary"} onClick={() => setViewMode("month")}>Month</Button>
          <Button variant={viewMode === "week" ? "default" : "secondary"} onClick={() => setViewMode("week")}>Week</Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => moveCursor("prev")}>Previous</Button>
            <Button variant="secondary" onClick={() => moveCursor("next")}>Next</Button>
          </div>
          <CardTitle>{title}</CardTitle>
          <Button variant="ghost" onClick={() => void load()}>Refresh</Button>
        </div>
      </Card>

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>Calendar error</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardDescription>Loading calendar...</CardDescription>
        </Card>
      ) : (
        <div className={`grid gap-3 ${viewMode === "month" ? "md:grid-cols-4 xl:grid-cols-7" : "md:grid-cols-2 xl:grid-cols-7"}`}>
          {visibleDays.map((day) => {
            const key = toDateKey(day);
            const jobs = jobsByDay.get(key) ?? [];
            return (
              <Card key={key} className="min-h-44 p-4">
                <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{day.toLocaleDateString()}</p>
                </div>
                <div className="space-y-2 text-xs">
                  {jobs.length === 0 ? (
                    <p className="text-slate-500 dark:text-slate-400">No scheduled jobs</p>
                  ) : (
                    jobs.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => void loadJobDetails(job.id)}
                        className={`w-full rounded-xl p-3 text-left ${statusClasses(job.status)}`}
                      >
                        <p className="font-semibold">{job.platform} - {job.status}</p>
                        <p className="mt-1 truncate">{job.draft.title ?? job.draft.caption ?? "Untitled draft"}</p>
                        <p className="mt-1">{new Date(job.runAt).toLocaleTimeString()}</p>
                      </button>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(selectedJob || detailLoading) ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <Card className="max-h-[90vh] w-full max-w-3xl overflow-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{selectedJob?.draft.title ?? selectedJob?.draft.caption ?? "Publish job"}</CardTitle>
                <CardDescription className="mt-1">
                  {selectedJob ? `${selectedJob.platform} - ${selectedJob.status}` : "Loading job details..."}
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => { setSelectedJob(null); setDetailLoading(false); }}>Close</Button>
            </div>

            {detailLoading ? (
              <CardDescription className="mt-4">Loading job details...</CardDescription>
            ) : selectedJob ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                    <p>Run at: {new Date(selectedJob.runAt).toLocaleString()}</p>
                    <p>Remote publish id: {selectedJob.remotePublishId ?? "Not available"}</p>
                    <p>Remote URL: {selectedJob.remoteUrl ?? "Not available"}</p>
                    <p>Last error: {selectedJob.lastErrorKind ?? "none"} {selectedJob.lastErrorMessage ? `| ${selectedJob.lastErrorMessage}` : ""}</p>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                    <label className="space-y-2 text-sm font-medium">
                      <span>Reschedule</span>
                      <input
                        type="datetime-local"
                        value={rescheduleValue}
                        onChange={(event) => setRescheduleValue(event.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void rescheduleJob()} disabled={acting}>Reschedule</Button>
                      <Button variant="ghost" onClick={() => void cancelJob()} disabled={acting}>Cancel job</Button>
                      {(selectedJob.status === "FAILED" || selectedJob.status === "NEEDS_REAUTH" || selectedJob.status === "CANCELLED") ? (
                        <Button variant="secondary" onClick={() => void retryJob()} disabled={acting}>Retry</Button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/${locale}/drafts`}>
                        <Button variant="secondary">Open drafts</Button>
                      </Link>
                      <Link href={`/${locale}/history`}>
                        <Button variant="secondary">Open history</Button>
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Attempts</p>
                    {selectedJob.attempts.length === 0 ? (
                      <CardDescription>No attempts yet.</CardDescription>
                    ) : (
                      selectedJob.attempts.map((attempt) => (
                        <div key={attempt.id} className="rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-700">
                          <p className="font-semibold text-slate-900 dark:text-white">Attempt #{attempt.attemptNumber} - {attempt.status}</p>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">
                            {attempt.normalizedErrorKind ? `${attempt.normalizedErrorKind}: ${attempt.normalizedErrorMessage ?? ""}` : "No normalized error."}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(attempt.startedAt).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Timeline</p>
                    {selectedJob.events.length === 0 ? (
                      <CardDescription>No events logged yet.</CardDescription>
                    ) : (
                      selectedJob.events.map((event) => (
                        <div key={event.id} className="rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-700">
                          <p className="font-semibold text-slate-900 dark:text-white">{event.eventType}</p>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">{event.message ?? "No message"}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(event.createdAt).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const normalized = new Date(date.getTime() - offset * 60_000);
  return normalized.toISOString().slice(0, 16);
}

function statusClasses(status: string) {
  if (status === "FAILED" || status === "NEEDS_REAUTH") {
    return "bg-rose-50 text-rose-800 dark:bg-rose-950/20 dark:text-rose-200";
  }
  if (status === "SUCCEEDED") {
    return "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200";
  }
  if (status === "RUNNING" || status === "WAITING_REMOTE") {
    return "bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100";
}

function weekDays(cursor: Date): Date[] {
  const current = new Date(cursor);
  const dayIndex = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - dayIndex);
  return Array.from({ length: 7 }, (_, index) => {
    const item = new Date(current);
    item.setDate(current.getDate() + index);
    return item;
  });
}

function monthDays(cursor: Date): Date[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let day = first.getDate(); day <= last.getDate(); day += 1) {
    days.push(new Date(year, month, day));
  }
  return days;
}
