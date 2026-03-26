"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, CardDescription, CardTitle, Input } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

interface DraftItem {
  id: string;
  title: string | null;
  caption: string | null;
  description: string | null;
  status: string;
  timezone: string | null;
  scheduledAt: string | null;
  updatedAt: string;
  mediaCount: number;
  platforms: string[];
}

export default function DraftsPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "en";
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scheduleByDraft, setScheduleByDraft] = useState<Record<string, string>>({});

  const loadDrafts = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (query.trim()) {
        qs.set("query", query.trim());
      }
      const response = await apiRequest<{ items: DraftItem[] }>(`/drafts${qs.toString() ? `?${qs.toString()}` : ""}`);
      setItems(response.items);
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError("Unable to load drafts.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrafts();
  }, [query]);

  const publishNow = async (draftId: string) => {
    try {
      await apiRequest(`/drafts/${draftId}/publish-now`, { method: "POST" });
      await loadDrafts();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Failed to queue publish.");
    }
  };

  const duplicateDraft = async (draftId: string) => {
    try {
      await apiRequest(`/drafts/${draftId}/duplicate`, { method: "POST" });
      await loadDrafts();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Failed to duplicate draft.");
    }
  };

  const archiveDraft = async (draftId: string) => {
    try {
      await apiRequest(`/drafts/${draftId}`, { method: "DELETE" });
      await loadDrafts();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Failed to archive draft.");
    }
  };

  const scheduleDraft = async (draftId: string) => {
    const value = scheduleByDraft[draftId];
    if (!value) {
      setError("Choose a schedule date/time first.");
      return;
    }

    try {
      await apiRequest(`/drafts/${draftId}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          scheduledAt: new Date(value).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      await loadDrafts();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Failed to schedule draft.");
    }
  };

  const cancelDraft = async (draftId: string) => {
    try {
      await apiRequest(`/drafts/${draftId}/cancel`, {
        method: "POST",
        body: "{}"
      });
      await loadDrafts();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Failed to cancel draft.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Drafts</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Compose content, schedule by platform, and publish safely.</p>
        </div>
        <Link href={`/${locale}/drafts/new`}>
          <Button>Create draft</Button>
        </Link>
      </div>

      <Card>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search drafts by title/caption..." />
      </Card>

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>Draft error</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardDescription>Loading drafts...</CardDescription>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardTitle>No drafts yet</CardTitle>
            <CardDescription className="mt-2">Create your first draft to start scheduling posts.</CardDescription>
          </Card>
        ) : (
          items.map((draft) => (
            <Card key={draft.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>{draft.title ?? "Untitled draft"}</CardTitle>
                  <CardDescription className="mt-1">
                    Status: {draft.status} | Platforms: {draft.platforms.join(", ") || "None"} | Media: {draft.mediaCount}
                  </CardDescription>
                </div>
                <span className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  {new Date(draft.updatedAt).toLocaleString()}
                </span>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-400">{draft.caption ?? draft.description ?? "No caption yet."}</p>

              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Input
                  type="datetime-local"
                  value={scheduleByDraft[draft.id] ?? ""}
                  onChange={(event) =>
                    setScheduleByDraft((previous) => ({
                      ...previous,
                      [draft.id]: event.target.value
                    }))
                  }
                />
                <Button variant="secondary" onClick={() => void scheduleDraft(draft.id)}>
                  Schedule
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void publishNow(draft.id)}>Publish now</Button>
                <Button variant="secondary" onClick={() => void duplicateDraft(draft.id)}>
                  Duplicate
                </Button>
                <Button variant="ghost" onClick={() => void cancelDraft(draft.id)}>
                  Cancel schedule
                </Button>
                <Button variant="danger" onClick={() => void archiveDraft(draft.id)}>
                  Archive
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
