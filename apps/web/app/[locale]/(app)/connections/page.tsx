"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, CardDescription, CardTitle } from "@postport/ui";
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
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError("Unable to load connections.");
      }
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
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError("Failed to start the connection flow.");
      }
    }
  };

  const refreshConnection = async (connectionId: string) => {
    try {
      await apiRequest(`/connections/${connectionId}/refresh`, { method: "POST", body: "{}" });
      await loadConnections();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError("Failed to refresh connection metadata.");
      }
    }
  };

  const reconnectConnection = async (connectionId: string) => {
    try {
      await apiRequest(`/connections/${connectionId}/reconnect`, { method: "POST", body: "{}" });
      await loadConnections();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError("Failed to reconnect.");
      }
    }
  };

  const disconnectConnection = async (connectionId: string) => {
    try {
      await apiRequest(`/connections/${connectionId}/disconnect`, { method: "POST", body: "{}" });
      await loadConnections();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError("Failed to disconnect.");
      }
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Connections</h2>
      <Card>
        <CardTitle>Connect publishing targets</CardTitle>
        <CardDescription className="mt-2">Start the provider auth flow to connect Instagram, Facebook Pages, or TikTok.</CardDescription>
        <div className="mt-4 flex flex-wrap gap-3">
          {platforms.map((platform) => (
            <Button key={platform} onClick={() => void startConnection(platform)}>
              Connect {platform.toLowerCase()}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => void loadConnections()}>
            Refresh list
          </Button>
        </div>
      </Card>

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>Error</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardDescription>Loading connections...</CardDescription>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardDescription>No connected accounts yet.</CardDescription>
          </Card>
        ) : (
          items.map((account) => (
            <Card key={account.id}>
              <CardTitle>{account.displayName}</CardTitle>
              <CardDescription className="mt-1">
                {account.platform} | {account.status} | expires{" "}
                {account.tokenExpiresAt ? new Date(account.tokenExpiresAt).toLocaleString() : "unknown"}
              </CardDescription>
              <div className="mt-3 flex flex-wrap gap-2">
                {account.profiles.map((profile) => (
                  <span
                    key={profile.id}
                    className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300"
                  >
                    {profile.name} {profile.username ? `(@${profile.username})` : ""}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void refreshConnection(account.id)}>
                  Refresh metadata
                </Button>
                <Button variant="ghost" onClick={() => void reconnectConnection(account.id)}>
                  Reconnect
                </Button>
                <Button variant="danger" onClick={() => void disconnectConnection(account.id)}>
                  Disconnect
                </Button>
                <Link href={`/${locale}/connections/${account.id}`}>
                  <Button variant="secondary">Health</Button>
                </Link>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
