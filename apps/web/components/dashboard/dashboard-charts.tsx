"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CardDescription, cn } from "@postport/ui";
import { PlatformBadge, formatPlatformLabel } from "@/components/platform/platform-brand";

export interface PublishingCadencePoint {
  label: string;
  success: number;
  failed: number;
}

export interface PlatformSnapshotChartData {
  platform: string;
  connections: number;
  publishes: number;
  failed: number;
  queued: number;
}

const chartPalette = {
  success: "#22c55e",
  failed: "#fb7185",
  queued: "#38bdf8",
  track: "#1e293b",
  muted: "#64748b",
  foreground: "#e2e8f0"
};

export function ResolvedPublishQualityChart({
  successRate,
  successCount,
  failedCount
}: {
  successRate: number;
  successCount: number;
  failedCount: number;
}) {
  const value = clamp(successRate, 0, 100);
  const chartData = [
    { name: "resolved", value },
    { name: "remaining", value: Math.max(0, 100 - value) }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr] lg:items-center">
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              <linearGradient id="qualityGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#14b8a6" />
              </linearGradient>
            </defs>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={82}
              cornerRadius={18}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill="url(#qualityGradient)" />
              <Cell fill="rgba(148, 163, 184, 0.18)" />
              <Label
                position="center"
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                    return null;
                  }

                  return (
                    <g>
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy! - 6}
                        textAnchor="middle"
                        className="fill-slate-900 text-[30px] font-semibold dark:fill-slate-100"
                      >
                        {value}%
                      </text>
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy! + 18}
                        textAnchor="middle"
                        className="fill-slate-500 text-[11px] font-medium uppercase tracking-[0.22em] dark:fill-slate-400"
                      >
                        success
                      </text>
                    </g>
                  );
                }}
              />
            </Pie>
            <Tooltip content={<DashboardTooltip hideLabel />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard label="Succeeded" value={successCount} tone="success" />
          <KpiCard label="Failed" value={failedCount} tone="failed" />
        </div>
        <CardDescription className="max-w-md text-sm">
          Success rate is calculated from resolved publish history, not queued jobs. This gives you a cleaner read on reliability over time.
        </CardDescription>
      </div>
    </div>
  );
}

export function PublishingCadenceChart({
  points,
  loading
}: {
  points: PublishingCadencePoint[];
  loading: boolean;
}) {
  const chartData = points.map((point) => ({
    ...point,
    total: point.success + point.failed
  }));

  return (
    <div className="mt-6">
      {loading ? (
        <CardDescription>Loading cadence chart...</CardDescription>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={10} barCategoryGap="28%">
              <defs>
                <linearGradient id="cadenceSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="cadenceFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb7185" />
                  <stop offset="100%" stopColor="#e11d48" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.18)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 600 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={28}
                tick={{ fill: "#94a3b8", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.08)", radius: 16 }}
                content={<DashboardTooltip />}
              />
              <Bar dataKey="success" name="Succeeded" fill="url(#cadenceSuccess)" radius={[10, 10, 4, 4]} maxBarSize={34} />
              <Bar dataKey="failed" name="Failed" fill="url(#cadenceFailed)" radius={[10, 10, 4, 4]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        <LegendChip color={chartPalette.success}>Succeeded</LegendChip>
        <LegendChip color={chartPalette.failed}>Failed</LegendChip>
      </div>
    </div>
  );
}

export function PlatformMixChart({
  snapshots,
  loading
}: {
  snapshots: PlatformSnapshotChartData[];
  loading: boolean;
}) {
  const chartData = snapshots.map((snapshot) => ({
    platform: formatPlatformLabel(snapshot.platform),
    success: snapshot.publishes,
    failed: snapshot.failed,
    queued: snapshot.queued,
    connections: snapshot.connections
  }));

  return (
    <div className="mt-5 space-y-4">
      {loading ? (
        <CardDescription>Loading platform mix...</CardDescription>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
              <defs>
                <linearGradient id="platformSuccess" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="platformFailed" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#fb7185" />
                  <stop offset="100%" stopColor="#e11d48" />
                </linearGradient>
                <linearGradient id="platformQueued" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148, 163, 184, 0.16)" />
              <XAxis
                type="number"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#94a3b8", fontSize: 12 }}
              />
              <YAxis
                dataKey="platform"
                type="category"
                tickLine={false}
                axisLine={false}
                width={82}
                tick={{ fill: "#cbd5e1", fontSize: 12, fontWeight: 600 }}
              />
              <Tooltip content={<DashboardTooltip />} />
              <Bar dataKey="success" name="Succeeded" stackId="a" fill="url(#platformSuccess)" radius={[8, 0, 0, 8]} />
              <Bar dataKey="failed" name="Failed" stackId="a" fill="url(#platformFailed)" />
              <Bar dataKey="queued" name="Queued" stackId="a" fill="url(#platformQueued)" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {snapshots.map((snapshot) => (
          <div key={snapshot.platform} className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2">
              <PlatformBadge platform={snapshot.platform} />
              <span className="text-xs text-slate-500 dark:text-slate-400">{snapshot.connections} conn.</span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <p>{snapshot.publishes} succeeded</p>
              <p>{snapshot.failed} failed</p>
              <p>{snapshot.queued} queued</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        <LegendChip color={chartPalette.success}>Succeeded</LegendChip>
        <LegendChip color={chartPalette.failed}>Failed</LegendChip>
        <LegendChip color={chartPalette.queued}>Queued</LegendChip>
      </div>
    </div>
  );
}

function DashboardTooltip({
  active,
  payload,
  label,
  hideLabel = false
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
  hideLabel?: boolean;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-950/95">
      {!hideLabel && label ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{label}</p>
      ) : null}
      <div className="space-y-2">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color ?? chartPalette.muted }} />
              <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
            </div>
            <span className="font-medium text-slate-900 dark:text-slate-100">{entry.value ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendChip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

function KpiCard({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "success" | "failed";
}) {
  const styles =
    tone === "success"
      ? "border-emerald-300/60 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100"
      : "border-rose-300/60 bg-rose-50/70 text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100";

  return (
    <div className={cn("rounded-2xl border px-4 py-3", styles)}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
