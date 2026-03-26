"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Button, Input } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";

const quickLinks = [
  { href: "/onboarding", label: "Setup" },
  { href: "/drafts/new", label: "New draft" },
  { href: "/media", label: "Upload media" }
];

export const Topbar = () => {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [userLabel, setUserLabel] = useState("Loading...");

  const localePrefix = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const locale = segments[0];
    return locale ? `/${locale}` : "/en";
  }, [pathname]);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiRequest<{ email: string; fullName?: string | null }>("/auth/me");
        setUserLabel(me.fullName?.trim() || me.email);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setUserLabel("Signed out");
          return;
        }
        setUserLabel("Unavailable");
      }
    };

    void load();
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 lg:px-8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
          <div className="max-w-sm flex-1">
            <Input placeholder="Search media, drafts, jobs..." aria-label="Global search placeholder" />
          </div>
          <div className="flex flex-wrap gap-2">
            {quickLinks.map((item) => (
              <Link key={item.href} href={`${localePrefix}${item.href}`}>
                <Button variant="secondary">{item.label}</Button>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 xl:justify-end">
          <Button
            variant="secondary"
            className="w-10 px-0"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {userLabel}
          </div>
        </div>
      </div>
    </header>
  );
};
