"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardDescription, CardTitle } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

interface ConnectionItem {
  id: string;
  displayName: string;
  platform: string;
}

interface ConnectionHealth {
  warnings: string[];
  lastSuccessfulPublish: string | null;
  lastError: string | null;
}

interface PublishAttempt {
  id: string;
  status: string;
  normalizedErrorKind: string | null;
  normalizedErrorMessage: string | null;
}

interface PublishJob {
  id: string;
  platform: string;
  status: string;
  remoteUrl: string | null;
  updatedAt: string;
  runAt: string;
  attempts: PublishAttempt[];
}

interface DashboardData {
  connectedAccounts: number;
  readyMedia: number;
  scheduledPosts: number;
  failedJobs: number;
  recentActivity: PublishJob[];
  lastPublishes: PublishJob[];
  connectionWarnings: Array<{
    connectionId: string;
    label: string;
    warning: string;
  }>;
}

export default function DashboardPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "en";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({
    connectedAccounts: 0,
    readyMedia: 0,
    scheduledPosts: 0,
    failedJobs: 0,
    recentActivity: [],
    lastPublishes: [],
    connectionWarnings: []
  });

  const widgets = useMemo(
    () => [
      {
        label: "Connected accounts",
        value: String(data.connectedAccounts),
        detail:
          data.connectedAccounts === 0 ? "Connect Instagram, Facebook, or TikTok targets to start publishing." : "Connected targets are available."
      },
      {
        label: "Ready media",
        value: String(data.readyMedia),
        detail: data.readyMedia === 0 ? "Upload media to kick off processing." : "Media is ready for draft composition."
      },
      {
        label: "Scheduled posts",
        value: String(data.scheduledPosts),
        detail: data.scheduledPosts === 0 ? "Nothing is queued yet." : "Upcoming publish jobs are queued."
      },
      {
        label: "Failed jobs",
        value: String(data.failedJobs),
        detail: data.failedJobs === 0 ? "No failed jobs right now." : "Review history and retry transient failures."
      }
    ],
    [data.connectedAccounts, data.failedJobs, data.readyMedia, data.scheduledPosts]
  );

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const me = await apiRequest<{ email: string }>("/auth/me");
        setUserEmail(me.email);

        const [connections, readyMedia, queuedJobs, failedJobs, history] = await Promise.all([
          apiRequest<{ items: ConnectionItem[] }>("/connections"),
          apiRequest<{ items: Array<{ status: string }> }>("/media?status=READY"),
          apiRequest<{ items: PublishJob[] }>("/publish/jobs?status=QUEUED"),
          apiRequest<{ items: PublishJob[] }>("/publish/jobs?status=FAILED"),
          apiRequest<{ items: PublishJob[] }>("/publish/history")
        ]);

        const healthResults = await Promise.all(
          connections.items.map(async (connection) => {
            try {
              const health = await apiRequest<ConnectionHealth>(`/connections/${connection.id}/health`);
              return {
                connectionId: connection.id,
                label: `${connection.platform} - ${connection.displayName}`,
                health
              };
            } catch {
              return null;
            }
          })
        );

        const connectionWarnings = healthResults
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .flatMap((item) =>
            item.health.warnings.map((warning) => ({
              connectionId: item.connectionId,
              label: item.label,
              warning
            }))
          )
          .slice(0, 6);

        const recentActivity = [...history.items].slice(0, 5);
        const lastPublishes = history.items.filter((job) => job.status === "SUCCEEDED").slice(0, 5);

        setData({
          connectedAccounts: connections.items.length,
          readyMedia: readyMedia.items.length,
          scheduledPosts: queuedJobs.items.length,
          failedJobs: failedJobs.items.length,
          recentActivity,
          lastPublishes,
          connectionWarnings
        });
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          setError("You are not signed in. Use /en/login to authenticate.");
        } else if (cause instanceof ApiError) {
          setError(cause.message);
        } else {
          setError("Unable to load dashboard data.");
        }
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
    const interval = setInterval(() => {
      void loadDashboard();
    }, 20_000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Overview</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {userEmail ? `Signed in as ${userEmail}.` : "Live workspace metrics, warnings, and recent publishes."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${locale}/onboarding`}>
            <Button variant="secondary">Setup guide</Button>
          </Link>
          <Link href={`/${locale}/drafts/new`}>
            <Button>Create draft</Button>
          </Link>
        </div>
      </div>

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>Dashboard unavailable</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {widgets.map((widget) => (
          <Card key={widget.label}>
            <CardDescription>{widget.label}</CardDescription>
            <CardTitle className="mt-2 text-3xl">{loading ? "..." : widget.value}</CardTitle>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{widget.detail}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription className="mt-1">Latest publish outcomes across platforms.</CardDescription>
            </div>
            <Link href={`/${locale}/history`}>
              <Button variant="secondary">Open history</Button>
            </Link>
          </div>
          <div className="space-y-3">
            {loading ? (
              <CardDescription>Loading recent activity...</CardDescription>
            ) : data.recentActivity.length === 0 ? (
              <CardDescription>No publish activity yet.</CardDescription>
            ) : (
              data.recentActivity.map((job) => (
                <div
                  key={job.id}
                  className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {job.platform} - {job.status}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(job.updatedAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Run at {new Date(job.runAt).toLocaleString()}
                  </p>
                  {job.attempts[0]?.normalizedErrorMessage ? (
                    <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
                      {job.attempts[0].normalizedErrorKind ?? "error"}: {job.attempts[0].normalizedErrorMessage}
                    </p>
                  ) : job.remoteUrl ? (
                    <a
                      href={job.remoteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300"
                    >
                      Open published post
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Connection warnings</CardTitle>
                <CardDescription className="mt-1">Eligibility or authorization issues that need attention.</CardDescription>
              </div>
              <Link href={`/${locale}/connections`}>
                <Button variant="secondary">Connections</Button>
              </Link>
            </div>
            {loading ? (
              <CardDescription>Loading connection health...</CardDescription>
            ) : data.connectionWarnings.length === 0 ? (
              <CardDescription>No active connection warnings.</CardDescription>
            ) : (
              <div className="space-y-3">
                {data.connectionWarnings.map((warning) => (
                  <Link
                    key={`${warning.connectionId}-${warning.warning}`}
                    href={`/${locale}/connections/${warning.connectionId}`}
                    className="block rounded-2xl border border-amber-300 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-900/80 dark:bg-amber-950/20 dark:text-amber-100"
                  >
                    <p className="font-semibold">{warning.label}</p>
                    <p className="mt-1">{warning.warning}</p>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Last publishes</CardTitle>
                <CardDescription className="mt-1">Recently succeeded remote publishes.</CardDescription>
              </div>
              <Link href={`/${locale}/calendar`}>
                <Button variant="secondary">Calendar</Button>
              </Link>
            </div>
            {loading ? (
              <CardDescription>Loading publish summary...</CardDescription>
            ) : data.lastPublishes.length === 0 ? (
              <CardDescription>No successful publishes yet.</CardDescription>
            ) : (
              <div className="space-y-3">
                {data.lastPublishes.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{job.platform}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Completed {new Date(job.updatedAt).toLocaleString()}
                    </p>
                    {job.remoteUrl ? (
                      <a
                        href={job.remoteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300"
                      >
                        Open remote post
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
