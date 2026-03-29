"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Link2,
  Sparkles,
  TrendingUp,
  XCircle
} from "lucide-react";
import { Button, Card, CardDescription, CardTitle, cn } from "@postport/ui";
import {
  PlatformMixChart,
  PublishingCadenceChart,
  ResolvedPublishQualityChart
} from "@/components/dashboard/dashboard-charts";
import { PlatformBadge, PlatformSurface, formatPlatformLabel } from "@/components/platform/platform-brand";
import { ApiError, apiRequest } from "@/lib/api-client";

type Platform = "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | string;

interface ConnectionItem {
  id: string;
  displayName: string;
  platform: Platform;
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
  platform: Platform;
  status: string;
  remoteUrl: string | null;
  updatedAt: string;
  runAt: string;
  attempts: PublishAttempt[];
}

interface PlatformSnapshot {
  platform: Platform;
  connections: number;
  publishes: number;
  failed: number;
  queued: number;
}

interface ActivityPoint {
  label: string;
  success: number;
  failed: number;
}

interface DashboardData {
  connectedAccounts: number;
  readyMedia: number;
  scheduledPosts: number;
  failedJobs: number;
  successRate: number;
  resolvedSuccessCount: number;
  resolvedFailedCount: number;
  recentActivity: PublishJob[];
  lastPublishes: PublishJob[];
  platformSnapshots: PlatformSnapshot[];
  activityPoints: ActivityPoint[];
  connectionWarnings: Array<{
    connectionId: string;
    displayName: string;
    platform: Platform;
    warning: string;
  }>;
}

const platformOrder: Platform[] = ["INSTAGRAM", "FACEBOOK", "TIKTOK"];

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
    successRate: 100,
    resolvedSuccessCount: 0,
    resolvedFailedCount: 0,
    recentActivity: [],
    lastPublishes: [],
    platformSnapshots: platformOrder.map((platform) => ({
      platform,
      connections: 0,
      publishes: 0,
      failed: 0,
      queued: 0
    })),
    activityPoints: buildActivityPoints([]),
    connectionWarnings: []
  });

  const widgets = useMemo(
    () => [
      {
        label: "Connected accounts",
        value: String(data.connectedAccounts),
        detail:
          data.connectedAccounts === 0 ? "Connect Instagram, Facebook, or TikTok targets to start publishing." : "Connected targets are available.",
        icon: Link2
      },
      {
        label: "Ready media",
        value: String(data.readyMedia),
        detail: data.readyMedia === 0 ? "Upload media to kick off processing." : "Media is ready for draft composition.",
        icon: Activity
      },
      {
        label: "Scheduled posts",
        value: String(data.scheduledPosts),
        detail: data.scheduledPosts === 0 ? "Nothing is queued yet." : "Upcoming publish jobs are queued.",
        icon: CalendarClock
      },
      {
        label: "Failed jobs",
        value: String(data.failedJobs),
        detail: data.failedJobs === 0 ? "No failed jobs right now." : "Review history and retry transient failures.",
        icon: AlertTriangle
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
                displayName: connection.displayName,
                platform: connection.platform,
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
              displayName: item.displayName,
              platform: item.platform,
              warning
            }))
          )
          .slice(0, 6);

        const recentActivity = [...history.items].slice(0, 5);
        const lastPublishes = history.items.filter((job) => job.status === "SUCCEEDED").slice(0, 4);
        const successCount = history.items.filter((job) => job.status === "SUCCEEDED").length;
        const failedCount = history.items.filter((job) => job.status === "FAILED").length;
        const resolvedCount = successCount + failedCount;

        const platformSnapshots = platformOrder.map((platform) => ({
          platform,
          connections: connections.items.filter((item) => item.platform === platform).length,
          publishes: history.items.filter((item) => item.platform === platform && item.status === "SUCCEEDED").length,
          failed: history.items.filter((item) => item.platform === platform && item.status === "FAILED").length,
          queued: queuedJobs.items.filter((item) => item.platform === platform).length
        }));

        setData({
          connectedAccounts: connections.items.length,
          readyMedia: readyMedia.items.length,
          scheduledPosts: queuedJobs.items.length,
          failedJobs: failedJobs.items.length,
          successRate: resolvedCount === 0 ? 100 : Math.round((successCount / resolvedCount) * 100),
          resolvedSuccessCount: successCount,
          resolvedFailedCount: failedCount,
          recentActivity,
          lastPublishes,
          platformSnapshots,
          activityPoints: buildActivityPoints(history.items),
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

  const activePlatforms = data.platformSnapshots.filter(
    (snapshot) => snapshot.connections > 0 || snapshot.publishes > 0 || snapshot.queued > 0 || snapshot.failed > 0
  );

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

      <Card className="overflow-hidden rounded-[34px] border-slate-200/90 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(236,72,153,0.08),_transparent_28%),rgba(255,255,255,0.94)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(236,72,153,0.12),_transparent_30%),rgba(15,23,42,0.92)]">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
              <Sparkles className="h-3.5 w-3.5" />
              Publishing pulse
            </span>
            <div>
              <CardTitle className="text-3xl">A clearer control center for your publishing flow</CardTitle>
              <CardDescription className="mt-2 max-w-2xl">
                Watch queue health, connection coverage, and recent outcomes in one place, with enough signal to spot platform issues before
                they become missed publishes.
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              {(activePlatforms.length === 0 ? platformOrder : activePlatforms.map((snapshot) => snapshot.platform)).map((platform) => (
                <PlatformBadge key={platform} platform={platform} />
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MiniCallout
                label="Success rate"
                value={`${loading ? "..." : data.successRate}%`}
                description="Resolved publishes that succeeded."
                icon={TrendingUp}
              />
              <MiniCallout
                label="Warnings"
                value={String(loading ? 0 : data.connectionWarnings.length)}
                description="Connection health issues needing attention."
                icon={AlertTriangle}
              />
              <MiniCallout
                label="Queue"
                value={String(loading ? 0 : data.scheduledPosts)}
                description="Jobs waiting for their run window."
                icon={Clock3}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[28px] border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Resolved publish quality</p>
              <div className="mt-5">
                <ResolvedPublishQualityChart
                  successRate={data.successRate}
                  successCount={data.resolvedSuccessCount}
                  failedCount={data.resolvedFailedCount}
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Platform coverage</p>
              <div className="mt-4 space-y-3">
                {platformOrder.map((platform) => {
                  const snapshot = data.platformSnapshots.find((item) => item.platform === platform);
                  return (
                    <div key={platform} className="rounded-2xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="flex items-center justify-between gap-3">
                        <PlatformBadge platform={platform} />
                        <span className="text-sm text-slate-500 dark:text-slate-400">{snapshot?.connections ?? 0} conn.</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {snapshot?.publishes ?? 0} success • {snapshot?.queued ?? 0} queued • {snapshot?.failed ?? 0} failed
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {widgets.map((widget) => (
          <WidgetCard key={widget.label} {...widget} loading={loading} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[30px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Publishing cadence</CardTitle>
              <CardDescription className="mt-1">Last 7 days of succeeded vs failed publish outcomes.</CardDescription>
            </div>
            <Link href={`/${locale}/history`}>
              <Button variant="secondary">Open history</Button>
            </Link>
          </div>
          <PublishingCadenceChart points={data.activityPoints} loading={loading} />
        </Card>

        <Card className="rounded-[30px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Platform mix</CardTitle>
              <CardDescription className="mt-1">Connected channels and publish outcomes by platform.</CardDescription>
            </div>
            <Link href={`/${locale}/connections`}>
              <Button variant="secondary">Connections</Button>
            </Link>
          </div>
          <PlatformMixChart snapshots={data.platformSnapshots} loading={loading} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4 rounded-[30px]">
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
                <PlatformSurface key={job.id} platform={job.platform} className="rounded-[26px] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PlatformBadge platform={job.platform} />
                      <StatusPill status={job.status} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(job.updatedAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Run at {new Date(job.runAt).toLocaleString()}</p>
                  {job.attempts[0]?.normalizedErrorMessage ? (
                    <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
                      {job.attempts[0].normalizedErrorKind ?? "error"}: {job.attempts[0].normalizedErrorMessage}
                    </p>
                  ) : job.remoteUrl ? (
                    <a
                      href={job.remoteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300"
                    >
                      Open published post
                    </a>
                  ) : null}
                </PlatformSurface>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 rounded-[30px]">
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
                    className="block rounded-[24px] border border-amber-300 bg-amber-50/85 p-4 text-sm text-amber-900 transition-transform hover:-translate-y-0.5 dark:border-amber-900/80 dark:bg-amber-950/20 dark:text-amber-100"
                  >
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={warning.platform} />
                      <span className="text-xs font-semibold uppercase tracking-[0.18em]">Needs attention</span>
                    </div>
                    <p className="mt-3 font-semibold">{warning.displayName}</p>
                    <p className="mt-1">{warning.warning}</p>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4 rounded-[30px]">
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
                  <PlatformSurface key={job.id} platform={job.platform} className="rounded-[24px] p-4">
                    <div className="flex items-center gap-3">
                      <PlatformBadge platform={job.platform} />
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatPlatformLabel(job.platform)}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Completed {new Date(job.updatedAt).toLocaleString()}
                    </p>
                    {job.remoteUrl ? (
                      <a
                        href={job.remoteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300"
                      >
                        Open remote post
                      </a>
                    ) : null}
                  </PlatformSurface>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function WidgetCard({
  label,
  value,
  detail,
  icon: Icon,
  loading
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Link2;
  loading: boolean;
}) {
  return (
    <Card className="rounded-[28px] border-slate-200/90 bg-white/95">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4" />
        <CardDescription className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</CardDescription>
      </div>
      <CardTitle className="mt-4 text-3xl">{loading ? "..." : value}</CardTitle>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{detail}</p>
    </Card>
  );
}

function MiniCallout({
  label,
  value,
  description,
  icon: Icon
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Sparkles;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone =
    normalized === "SUCCEEDED"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200"
      : normalized === "FAILED"
        ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
        : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200";

  const Icon = normalized === "SUCCEEDED" ? CheckCircle2 : normalized === "FAILED" ? XCircle : Clock3;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]", tone)}>
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

function buildActivityPoints(history: PublishJob[]): ActivityPoint[] {
  const formatter = new Intl.DateTimeFormat("en", { weekday: "short" });
  const today = new Date();
  const dayStarts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - (6 - index));
    return date;
  });

  return dayStarts.map((date) => {
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    const dayItems = history.filter((job) => {
      const jobDate = new Date(job.updatedAt);
      return jobDate >= date && jobDate < nextDate;
    });

    return {
      label: formatter.format(date),
      success: dayItems.filter((job) => job.status === "SUCCEEDED").length,
      failed: dayItems.filter((job) => job.status === "FAILED").length
    };
  });
}
