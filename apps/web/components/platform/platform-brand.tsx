"use client";

import type { HTMLAttributes, SVGProps } from "react";
import { cn } from "@postport/ui";

export type PlatformName = "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | string;

type PlatformTheme = {
  label: string;
  orbClassName: string;
  badgeClassName: string;
  softClassName: string;
  borderClassName: string;
  accentTextClassName: string;
  gradientClassName: string;
};

const platformThemes: Record<string, PlatformTheme> = {
  INSTAGRAM: {
    label: "Instagram",
    orbClassName: "bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 text-white shadow-[0_18px_45px_-24px_rgba(236,72,153,0.8)]",
    badgeClassName: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/70 dark:bg-fuchsia-950/40 dark:text-fuchsia-200",
    softClassName: "bg-gradient-to-br from-fuchsia-500/8 via-white to-orange-400/10 dark:from-fuchsia-500/10 dark:via-slate-950 dark:to-orange-400/10",
    borderClassName: "border-fuchsia-200/80 dark:border-fuchsia-900/60",
    accentTextClassName: "text-fuchsia-700 dark:text-fuchsia-200",
    gradientClassName: "from-fuchsia-500 via-rose-500 to-orange-400"
  },
  FACEBOOK: {
    label: "Facebook",
    orbClassName: "bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400 text-white shadow-[0_18px_45px_-24px_rgba(37,99,235,0.8)]",
    badgeClassName: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-200",
    softClassName: "bg-gradient-to-br from-blue-500/8 via-white to-cyan-400/10 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-400/10",
    borderClassName: "border-blue-200/80 dark:border-blue-900/60",
    accentTextClassName: "text-blue-700 dark:text-blue-200",
    gradientClassName: "from-blue-600 via-sky-500 to-cyan-400"
  },
  TIKTOK: {
    label: "TikTok",
    orbClassName: "bg-gradient-to-br from-slate-950 via-cyan-400 to-rose-500 text-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.9)]",
    badgeClassName: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100",
    softClassName: "bg-gradient-to-br from-slate-950/5 via-white to-cyan-400/10 dark:from-slate-950 dark:via-slate-950 dark:to-cyan-400/10",
    borderClassName: "border-slate-300/80 dark:border-slate-700/80",
    accentTextClassName: "text-slate-900 dark:text-slate-100",
    gradientClassName: "from-slate-950 via-cyan-400 to-rose-500"
  }
};

const defaultTheme: PlatformTheme = {
  label: "Platform",
  orbClassName: "bg-slate-900 text-white",
  badgeClassName: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  softClassName: "bg-slate-50/80 dark:bg-slate-900/60",
  borderClassName: "border-slate-200 dark:border-slate-800",
  accentTextClassName: "text-slate-700 dark:text-slate-200",
  gradientClassName: "from-slate-900 via-slate-700 to-slate-500"
};

export function formatPlatformLabel(platform: PlatformName) {
  return getPlatformTheme(platform).label;
}

export function getPlatformTheme(platform: PlatformName): PlatformTheme {
  return platformThemes[String(platform).toUpperCase()] ?? {
    ...defaultTheme,
    label: String(platform)
  };
}

export function PlatformBadge({
  platform,
  className,
  showLabel = true
}: {
  platform: PlatformName;
  className?: string;
  showLabel?: boolean;
}) {
  const theme = getPlatformTheme(platform);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        theme.badgeClassName,
        className
      )}
    >
      <PlatformGlyph platform={platform} className="h-3.5 w-3.5" />
      {showLabel ? theme.label : null}
    </span>
  );
}

export function PlatformOrb({
  platform,
  className
}: {
  platform: PlatformName;
  className?: string;
}) {
  const theme = getPlatformTheme(platform);

  return (
    <span
      className={cn(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-black/5 dark:ring-white/10",
        theme.orbClassName,
        className
      )}
    >
      <PlatformGlyph platform={platform} className="h-5 w-5" />
    </span>
  );
}

export function PlatformWordmark({
  platform,
  className,
  description
}: {
  platform: PlatformName;
  className?: string;
  description?: string;
}) {
  const theme = getPlatformTheme(platform);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <PlatformOrb platform={platform} />
      <div>
        <p className={cn("text-sm font-semibold", theme.accentTextClassName)}>{theme.label}</p>
        {description ? <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
    </div>
  );
}

export function PlatformSurface({
  platform,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { platform: PlatformName }) {
  const theme = getPlatformTheme(platform);

  return (
    <div className={cn("border", theme.borderClassName, theme.softClassName, className)} {...props}>
      {children}
    </div>
  );
}

function PlatformGlyph({
  platform,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { platform: PlatformName }) {
  switch (String(platform).toUpperCase()) {
    case "INSTAGRAM":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} {...props}>
          <rect x="4" y="4" width="16" height="16" rx="4.5" />
          <circle cx="12" cy="12" r="3.5" />
          <circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "FACEBOOK":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
          <path d="M13.4 21v-7h2.3l.4-2.8h-2.7V9.4c0-.8.2-1.4 1.4-1.4H16V5.5c-.3 0-.9-.1-1.8-.1-1.8 0-3 1.1-3 3.2v2.6H9v2.8h2.4v7h2z" />
        </svg>
      );
    case "TIKTOK":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
          <path d="M14.5 4c.6 1.8 1.8 3 3.5 3.8V11a7 7 0 0 1-3.5-1.2v5.6a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6 0 .9.1v3a2.4 2.4 0 1 0 1.5 2.3V4h3z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} {...props}>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.5 12h7" />
        </svg>
      );
  }
}
