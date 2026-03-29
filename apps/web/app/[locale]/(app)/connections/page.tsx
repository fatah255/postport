"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Clock3, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button, Card, CardDescription, CardTitle, cn } from "@postport/ui";
import { PlatformBadge, PlatformOrb, PlatformSurface, PlatformWordmark, getPlatformTheme } from "@/components/platform/platform-brand";
import { ApiError, apiRequest } from "@/lib/api-client";

type Platform = "INSTAGRAM" | "FACEBOOK" | "TIKTOK";

interface ConnectedAccount {
  id: string;
  platform: Platform;
  displayName: string;
  status: string;
  tokenExpiresAt: string | null;
  profiles: Array<{
    id: string;
    name: string;
    username?: string | null;
    isEligible: boolean;
  }>;
}

const platforms: Platform[] = ["INSTAGRAM", "FACEBOOK", "TIKTOK"];

const platformDescriptions: Record<Platform, string> = {
  INSTAGRAM: "Professional publishing, reel-ready metadata, and connected profile health.",
  FACEBOOK: "Page-based publishing targets with metadata refresh and target visibility.",
  TIKTOK: "Direct post or draft-upload readiness, depending on target capability."
};

export default function ConnectionsPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "en";
  const [items, setItems] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ items: ConnectedAccount[] }>("/connections");
      setItems(response.items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load connections.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConnections();
  }, []);

  const startConnection = async (platform: Platform) => {
    try {
      const response = await apiRequest<{ authUrl: string }>(`/connections/${platform}/start`, {
        method: "POST",
        body: "{}"
      });
      window.location.assign(response.authUrl);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to start the connection flow.");
    }
  };

  const refreshConnection = async (connectionId: string) => {
    try {
      await apiRequest(`/connections/${connectionId}/refresh`, { method: "POST", body: "{}" });
      await loadConnections();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to refresh connection metadata.");
    }
  };

  const reconnectConnection = async (connectionId: string) => {
    try {
      await apiRequest(`/connections/${connectionId}/reconnect`, { method: "POST", body: "{}" });
      await loadConnections();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to reconnect.");
    }
  };

  const disconnectConnection = async (connectionId: string) => {
    try {
      await apiRequest(`/connections/${connectionId}/disconnect`, { method: "POST", body: "{}" });
      await loadConnections();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to disconnect.");
    }
  };

  const stats = useMemo(() => {
    const activeAccounts = items.filter((item) => item.status === "ACTIVE").length;
    const eligibleTargets = items.reduce(
      (total, item) => total + item.profiles.filter((profile) => profile.isEligible).length,
      0
    );
    const expiringSoon = items.filter((item) => isExpiringSoon(item.tokenExpiresAt)).length;

    return [
      {
        label: "Connected accounts",
        value: items.length,
        note: items.length === 0 ? "No providers connected yet." : "Channel auth is linked and ready."
      },
      {
        label: "Active now",
        value: activeAccounts,
        note: activeAccounts === 0 ? "No active tokens right now." : "Accounts ready for metadata sync."
      },
      {
        label: "Eligible targets",
        value: eligibleTargets,
        note: eligibleTargets === 0 ? "Refresh metadata to surface new targets." : "Targets can be picked in drafts."
      },
      {
        label: "Expiring soon",
        value: expiringSoon,
        note: expiringSoon === 0 ? "Nothing urgent to reconnect." : "Reconnect before token expiry blocks publishing."
      }
    ];
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Connections</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Connect channels, refresh targets, and keep publish eligibility healthy across platforms.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void loadConnections()}>
          Refresh list
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="rounded-[28px] border-slate-200/90 bg-white/95">
            <CardDescription>{stat.label}</CardDescription>
            <CardTitle className="mt-3 text-3xl">{loading ? "..." : stat.value}</CardTitle>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{stat.note}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden rounded-[32px] border-slate-200/90 bg-white/95">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <Sparkles className="h-3.5 w-3.5" />
              Connect publishing targets
            </span>
            <div>
              <CardTitle className="text-2xl">Bring every channel into one control surface</CardTitle>
              <CardDescription className="mt-2 max-w-xl">
                Start the provider auth flow to connect Instagram, Facebook Pages, or TikTok. Connected targets flow straight into drafts,
                validation, scheduling, and health checks.
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <QuickInfo label="Profiles" value={items.reduce((total, item) => total + item.profiles.length, 0)} icon={Users} />
              <QuickInfo label="Healthy" value={items.filter((item) => item.status === "ACTIVE").length} icon={ShieldCheck} />
              <QuickInfo label="Expiring" value={items.filter((item) => isExpiringSoon(item.tokenExpiresAt)).length} icon={Clock3} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {platforms.map((platform) => {
              const theme = getPlatformTheme(platform);
              return (
                <PlatformSurface
                  key={platform}
                  platform={platform}
                  className="rounded-[28px] p-5 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.7)]"
                >
                  <div className="flex h-full flex-col justify-between gap-5">
                    <PlatformWordmark platform={platform} description={platformDescriptions[platform]} />
                    <Button
                      onClick={() => void startConnection(platform)}
                      className="justify-between rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
                    >
                      Connect {theme.label.toLowerCase()}
                      <ArrowUpRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </PlatformSurface>
              );
            })}
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>Error</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardDescription>Loading connections...</CardDescription>
        </Card>
      ) : items.length === 0 ? (
        <Card className="rounded-[28px] border-dashed">
          <CardTitle>No connected accounts yet</CardTitle>
          <CardDescription className="mt-2">
            Start with one platform tile above, then refresh metadata to bring connected targets into the composer.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((account) => {
            const eligibleTargets = account.profiles.filter((profile) => profile.isEligible).length;

            return (
              <PlatformSurface key={account.id} platform={account.platform} className="rounded-[30px] p-6 shadow-sm">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <PlatformOrb platform={account.platform} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <PlatformBadge platform={account.platform} />
                          <StatusBadge status={account.status} />
                        </div>
                        <CardTitle className="mt-3 text-2xl">{account.displayName}</CardTitle>
                        <CardDescription className="mt-2">
                          {account.tokenExpiresAt
                            ? `Token expires ${new Date(account.tokenExpiresAt).toLocaleString()}.`
                            : "Token expiry is unknown."}
                        </CardDescription>
                      </div>
                    </div>

                    <Link href={`/${locale}/connections/${account.id}`}>
                      <Button variant="secondary" className="rounded-2xl">
                        Health
                      </Button>
                    </Link>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricTile label="Targets" value={account.profiles.length} />
                    <MetricTile label="Eligible" value={eligibleTargets} />
                    <MetricTile label="Needs review" value={Math.max(account.profiles.length - eligibleTargets, 0)} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {account.profiles.length === 0 ? (
                      <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        No targets synced yet
                      </span>
                    ) : (
                      account.profiles.map((profile) => (
                        <span
                          key={profile.id}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium",
                            profile.isEligible
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200"
                              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
                          )}
                        >
                          {profile.name}
                          {profile.username ? ` (@${profile.username})` : ""}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="rounded-2xl" onClick={() => void refreshConnection(account.id)}>
                      Refresh metadata
                    </Button>
                    <Button variant="ghost" className="rounded-2xl" onClick={() => void reconnectConnection(account.id)}>
                      Reconnect
                    </Button>
                    <Button variant="danger" className="rounded-2xl" onClick={() => void disconnectConnection(account.id)}>
                      Disconnect
                    </Button>
                  </div>
                </div>
              </PlatformSurface>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuickInfo({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.toUpperCase();
  const tone =
    normalizedStatus === "ACTIVE"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200"
      : normalizedStatus === "REVOKED"
        ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
        : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200";

  return (
    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]", tone)}>
      {status}
    </span>
  );
}

function isExpiringSoon(tokenExpiresAt: string | null) {
  if (!tokenExpiresAt) {
    return false;
  }

  const msRemaining = new Date(tokenExpiresAt).getTime() - Date.now();
  return msRemaining > 0 && msRemaining <= 1000 * 60 * 60 * 24 * 14;
}
