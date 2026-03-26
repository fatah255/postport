"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardDescription, CardTitle } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

interface AuthMeResponse {
  memberships: Array<{
    workspace: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
}

interface DashboardSnapshot {
  workspaceCount: number;
  connectedAccounts: number;
  readyMedia: number;
  drafts: number;
  loading: boolean;
}

export default function OnboardingPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "en";
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>({
    workspaceCount: 0,
    connectedAccounts: 0,
    readyMedia: 0,
    drafts: 0,
    loading: true
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);
      try {
        const [me, connections, media, drafts] = await Promise.all([
          apiRequest<AuthMeResponse>("/auth/me"),
          apiRequest<{ items: unknown[] }>("/connections"),
          apiRequest<{ items: unknown[] }>("/media?status=READY"),
          apiRequest<{ items: unknown[] }>("/drafts")
        ]);

        setSnapshot({
          workspaceCount: me.memberships.length,
          connectedAccounts: connections.items.length,
          readyMedia: media.items.length,
          drafts: drafts.items.length,
          loading: false
        });
      } catch (cause) {
        setSnapshot((current) => ({
          ...current,
          loading: false
        }));
        setError(cause instanceof ApiError ? cause.message : "Unable to load onboarding status.");
      }
    };

    void load();
  }, []);

  const checklist = useMemo(
    () => [
      {
        title: "Workspace ready",
        description: "Your first workspace is created automatically during signup.",
        complete: snapshot.workspaceCount > 0,
        href: `/${locale}/settings`,
        action: "Review settings"
      },
      {
        title: "Connect at least one target",
        description: "Instagram, Facebook Pages, and TikTok connections unlock publish validation.",
        complete: snapshot.connectedAccounts > 0,
        href: `/${locale}/connections`,
        action: "Open connections"
      },
      {
        title: "Upload processed media",
        description: "READY assets can be reused across drafts, schedules, and retries.",
        complete: snapshot.readyMedia > 0,
        href: `/${locale}/media`,
        action: "Open media"
      },
      {
        title: "Create your first draft",
        description: "Drafts are the handoff point for publish-now and scheduling flows.",
        complete: snapshot.drafts > 0,
        href: `/${locale}/drafts/new`,
        action: "Create draft"
      }
    ],
    [locale, snapshot.connectedAccounts, snapshot.drafts, snapshot.readyMedia, snapshot.workspaceCount]
  );

  const completedSteps = checklist.filter((item) => item.complete).length;
  const readyToPublish = completedSteps === checklist.length;

  return (
    <div className="app-bg min-h-screen px-4 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card className="overflow-hidden border-slate-200 bg-white/90 p-0 shadow-lg dark:border-slate-800 dark:bg-slate-950/90">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">
                  Setup Guide
                </p>
                <CardTitle className="text-3xl">Bring PostPort to first publish readiness</CardTitle>
                <CardDescription className="max-w-2xl text-base">
                  The fastest path is simple: connect a target, upload ready media, create a draft, and schedule or publish it.
                </CardDescription>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryTile label="Workspaces" value={snapshot.loading ? "..." : String(snapshot.workspaceCount)} />
                <SummaryTile
                  label="Connected targets"
                  value={snapshot.loading ? "..." : String(snapshot.connectedAccounts)}
                />
                <SummaryTile label="Ready media" value={snapshot.loading ? "..." : String(snapshot.readyMedia)} />
                <SummaryTile label="Drafts" value={snapshot.loading ? "..." : String(snapshot.drafts)} />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-slate-50 shadow-inner dark:border-slate-700">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Progress</p>
              <p className="mt-3 text-4xl font-semibold">{snapshot.loading ? "..." : `${completedSteps}/4`}</p>
              <p className="mt-2 text-sm text-slate-300">
                {readyToPublish
                  ? "Core setup is complete. You can move straight into scheduling and publish history."
                  : "Finish the remaining setup steps below to unlock a complete first publish flow."}
              </p>
              <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${(completedSteps / checklist.length) * 100}%` }}
                />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={readyToPublish ? `/${locale}/dashboard` : checklist.find((item) => !item.complete)?.href ?? `/${locale}/dashboard`}>
                  <Button>{readyToPublish ? "Open dashboard" : "Continue setup"}</Button>
                </Link>
                <Link href={`/${locale}/drafts/new`}>
                  <Button variant="secondary">Jump to composer</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>

        {error ? (
          <Card className="border-rose-300">
            <CardTitle>Onboarding status unavailable</CardTitle>
            <CardDescription className="mt-2">{error}</CardDescription>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Checklist</CardTitle>
                <CardDescription className="mt-1">Complete the essentials once, then operate from the dashboard.</CardDescription>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                {completedSteps} complete
              </span>
            </div>

            <div className="space-y-3">
              {checklist.map((item) => (
                <div
                  key={item.title}
                  className={`rounded-2xl border p-4 ${
                    item.complete
                      ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-900/80 dark:bg-emerald-950/20"
                      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        item.complete
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {item.complete ? "Done" : "Next"}
                    </span>
                  </div>
                  <div className="mt-4">
                    <Link href={item.href}>
                      <Button variant={item.complete ? "secondary" : "default"}>{item.action}</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <CardTitle>Recommended launch order</CardTitle>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">1. Connections</p>
                <p className="mt-1">Start with mock or real provider auth, then open Connection Health to confirm eligibility.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">2. Media Library</p>
                <p className="mt-1">Upload a few images or videos and wait until processing flips them into READY assets.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">3. Composer</p>
                <p className="mt-1">Use platform-aware validation, then publish immediately or queue a schedule with timezone awareness.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">4. History and Calendar</p>
                <p className="mt-1">Track outcomes, retry transient failures, and reschedule work without double-publishing.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
