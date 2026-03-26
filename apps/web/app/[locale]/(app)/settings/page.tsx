"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardDescription, CardTitle, Input } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

interface Profile {
  id: string;
  email: string;
  fullName: string;
  locale: "EN" | "FR" | "AR";
  createdAt?: string;
}

interface TeamMembership {
  workspace: {
    id: string;
    name: string;
  };
  role: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface BillingSnapshot {
  plan: string;
  status: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<TeamMembership[]>([]);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [locale, setLocale] = useState<Profile["locale"]>("EN");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileResponse, teamResponse, billingResponse] = await Promise.all([
        apiRequest<Profile>("/settings/profile"),
        apiRequest<{ memberships: TeamMembership[] }>("/settings/team"),
        apiRequest<BillingSnapshot>("/settings/billing-placeholder")
      ]);
      setProfile(profileResponse);
      setTeam(teamResponse.memberships);
      setBilling(billingResponse);
      setFullName(profileResponse.fullName);
      setLocale(profileResponse.locale);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest<Profile>("/settings/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName,
          locale
        })
      });
      setProfile(updated);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Settings</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Profile preferences, locale, and team membership visibility.</p>
      </div>

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>Settings error</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardDescription>Loading settings...</CardDescription>
        </Card>
      ) : (
        <>
          <Card className="space-y-4">
            <CardTitle>Profile</CardTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input id="email" value={profile?.email ?? ""} disabled />
              </div>
              <div className="space-y-2">
                <label htmlFor="fullName" className="text-sm font-medium">
                  Full name
                </label>
                <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label htmlFor="locale" className="text-sm font-medium">
                  Locale
                </label>
                <select
                  id="locale"
                  value={locale}
                  onChange={(event) => setLocale(event.target.value as Profile["locale"])}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="EN">English</option>
                  <option value="FR">French</option>
                  <option value="AR">Arabic</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void saveProfile()} disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </Card>

          <Card className="space-y-3">
            <CardTitle>Team Memberships</CardTitle>
            {team.length === 0 ? (
              <CardDescription>No team memberships found.</CardDescription>
            ) : (
              team.map((membership) => (
                <div
                  key={`${membership.workspace.id}-${membership.user.id}`}
                  className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"
                >
                  <p className="font-medium text-slate-900 dark:text-slate-100">{membership.workspace.name}</p>
                  <p className="text-slate-600 dark:text-slate-300">
                    {membership.user.fullName} ({membership.user.email}) | Role: {membership.role}
                  </p>
                </div>
              ))
            )}
          </Card>

          <Card className="space-y-3">
            <CardTitle>Billing</CardTitle>
            {billing ? (
              <CardDescription>
                Plan: {billing.plan} | Status: {billing.status}
              </CardDescription>
            ) : (
              <CardDescription>Billing information is not available.</CardDescription>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
