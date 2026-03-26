"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, CardDescription, CardTitle } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

interface ConnectionHealth {
  platform: string;
  accountLabel: string;
  tokenValid: boolean;
  tokenExpiresAt: string | null;
  accountStatus: string;
  requiredPermissionsPresent: boolean;
  targetEligible: boolean;
  publishModeAvailable: Record<string, unknown> | null;
  domainVerificationReminder: string | null;
  lastSuccessfulPublish: string | null;
  lastError: string | null;
  publishedPostsInLast24Hours: number;
  warnings: string[];
  notes: string[];
  checks: Array<{
    key: string;
    label: string;
    status: "pass" | "warn" | "fail";
    message: string;
  }>;
}

export default function ConnectionHealthPage() {
  const params = useParams<{ locale: string; id: string }>();
  const locale = params.locale ?? "en";
  const connectionId = params.id;
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<ConnectionHealth>(`/connections/${connectionId}/health`);
        setHealth(response);
      } catch (error) {
        setError(error instanceof ApiError ? error.message : "Unable to load connection health.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [connectionId]);

  if (loading) {
    return (
      <Card>
        <CardDescription>Loading health checks...</CardDescription>
      </Card>
    );
  }

  if (!health || error) {
    return (
      <Card className="border-rose-300">
        <CardTitle>Connection health unavailable</CardTitle>
        <CardDescription className="mt-2">{error ?? "Health data not found."}</CardDescription>
        <Link href={`/${locale}/connections`} className="mt-3 inline-flex">
          <Button variant="secondary">Back to connections</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Connection Health</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {health.accountLabel} · {health.platform}
          </p>
        </div>
        <Link href={`/${locale}/connections`}>
          <Button variant="secondary">Back</Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="space-y-4">
          <CardTitle>Readiness Checks</CardTitle>
          <CardDescription>Platform validation and eligibility summary.</CardDescription>
          <div className="space-y-3">
            {health.checks.map((check) => (
              <div
                key={check.key}
                className={`rounded-2xl border p-4 ${
                  check.status === "fail"
                    ? "border-rose-300 bg-rose-50 dark:border-rose-900/80 dark:bg-rose-950/30"
                    : check.status === "warn"
                      ? "border-amber-300 bg-amber-50 dark:border-amber-900/80 dark:bg-amber-950/30"
                      : "border-emerald-300 bg-emerald-50 dark:border-emerald-900/80 dark:bg-emerald-950/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{check.label}</p>
                  <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-950/70 dark:text-slate-300">
                    {check.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{check.message}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3">
            <CardTitle>Summary</CardTitle>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
              <li>Token valid: {health.tokenValid ? "Yes" : "No"}</li>
              <li>Token expires: {health.tokenExpiresAt ? new Date(health.tokenExpiresAt).toLocaleString() : "Unknown"}</li>
              <li>Account status: {health.accountStatus}</li>
              <li>Permissions present: {health.requiredPermissionsPresent ? "Yes" : "No"}</li>
              <li>Target eligible: {health.targetEligible ? "Yes" : "No"}</li>
              <li>Publish modes: {JSON.stringify(health.publishModeAvailable ?? {})}</li>
              <li>Instagram publishes in 24h: {health.publishedPostsInLast24Hours}</li>
              <li>Last successful publish: {health.lastSuccessfulPublish ? new Date(health.lastSuccessfulPublish).toLocaleString() : "None"}</li>
              <li>Last error: {health.lastError ?? "None"}</li>
            </ul>
          </Card>

          <Card className="space-y-3">
            <CardTitle>Platform Notes</CardTitle>
            <div className="flex flex-wrap gap-2">
              {health.notes.length === 0 ? (
                <CardDescription>No extra platform notes.</CardDescription>
              ) : (
                health.notes.map((note) => (
                  <span
                    key={note}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    {note}
                  </span>
                ))
              )}
            </div>
            <CardDescription>{health.domainVerificationReminder ?? "No additional domain reminder."}</CardDescription>
          </Card>

          {health.warnings.length > 0 ? (
            <Card className="space-y-2 border-amber-300">
              <CardTitle>Warnings</CardTitle>
              {health.warnings.map((warning) => (
                <CardDescription key={warning}>{warning}</CardDescription>
              ))}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
