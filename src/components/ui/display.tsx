import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import {
  CALL_OUTCOME,
  INTEREST_LEVEL,
  LEAD_STATUS,
  ROLE,
  TRIAL_STATUS,
  TONE_HEX,
  type Tone,
} from "@/lib/domain/constants";
import type { CallOutcome, InterestLevel, LeadStatus, Role, TrialStatus } from "@/lib/db/schema";

/* ------------------------- Semantic badges -------------------------- */

export function StatusBadge({
  status,
  short,
  size = "sm",
  className,
}: {
  status: LeadStatus;
  short?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const meta = LEAD_STATUS[status];
  return (
    <Badge tone={meta.tone} size={size} dot className={className}>
      {short ? (meta.short ?? meta.label) : meta.label}
    </Badge>
  );
}

export function InterestBadge({ level, size = "sm" }: { level: InterestLevel | null; size?: "xs" | "sm" | "md" }) {
  if (!level) return <span className="text-[12px] text-subtle">—</span>;
  const meta = INTEREST_LEVEL[level];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

export function TrialBadge({ status, size = "sm" }: { status: TrialStatus; size?: "xs" | "sm" | "md" }) {
  const meta = TRIAL_STATUS[status];
  return (
    <Badge tone={meta.tone} size={size} dot>
      {meta.short ?? meta.label}
    </Badge>
  );
}

export function OutcomeBadge({ outcome, size = "sm" }: { outcome: CallOutcome; size?: "xs" | "sm" | "md" }) {
  const meta = CALL_OUTCOME[outcome];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

export function RoleBadge({ role, size = "sm" }: { role: Role; size?: "xs" | "sm" | "md" }) {
  const meta = ROLE[role];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

/* ---------------------------- Progress ------------------------------ */

export function ProgressRing({
  value,
  max,
  size = 64,
  stroke = 6,
  tone = "accent",
  label,
  sublabel,
  className,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const complete = ratio >= 1;

  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="var(--surface-inset)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={complete ? TONE_HEX.success : TONE_HEX[tone]}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="stat-value text-[13px] font-semibold text-strong">{label ?? value}</div>
          {sublabel && <div className="mt-0.5 text-[10px] text-subtle">{sublabel}</div>}
        </div>
      </div>
      <span className="sr-only">
        {value} of {max}
      </span>
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  tone = "accent",
  className,
  showTrack = true,
}: {
  value: number;
  max: number;
  tone?: Tone;
  className?: string;
  showTrack?: boolean;
}) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full", showTrack && "bg-inset", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${ratio * 100}%`, backgroundColor: TONE_HEX[tone] }}
      />
    </div>
  );
}

/* ---------------------------- Stat tile ----------------------------- */

export function StatTile({
  label,
  value,
  sub,
  delta,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number | null;
  icon?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("group relative overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-xs", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-subtle">{label}</span>
        {icon && (
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-[15px]"
            style={{ backgroundColor: `color-mix(in oklch, ${TONE_HEX[tone]} 12%, transparent)`, color: TONE_HEX[tone] }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="stat-value text-[26px] font-semibold leading-none tracking-tight text-strong">{value}</span>
        {typeof delta === "number" && (
          <span
            className={cn(
              "text-[12px] font-medium tabular-nums",
              delta > 0 ? "text-success-text" : delta < 0 ? "text-danger-text" : "text-subtle",
            )}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta)}%
          </span>
        )}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

/* --------------------------- Empty state ---------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line text-center",
        compact ? "gap-2 px-6 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      {icon && (
        <div className="grid size-11 place-items-center rounded-xl bg-inset text-subtle [&_svg]:size-5">{icon}</div>
      )}
      <div className="space-y-1">
        <p className="text-[14px] font-semibold text-strong">{title}</p>
        {description && <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/* ---------------------------- Skeletons ----------------------------- */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-md", className)} {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex h-10 items-center gap-4 border-b border-line bg-sunken px-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-[46px] items-center gap-4 border-b border-line px-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" style={{ opacity: 1 - r * 0.06 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Misc ------------------------------- */

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-inset px-1.5 font-mono text-[10.5px] font-medium text-muted shadow-[0_1px_0_var(--line-strong)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function SectionTitle({
  children,
  count,
  action,
  className,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
        {children}
        {typeof count === "number" && (
          <span className="rounded-md bg-inset px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** Tiny inline sparkline — no chart library for a 60px trend. */
export function Sparkline({
  data,
  width = 72,
  height = 22,
  tone = "accent",
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: Tone;
  className?: string;
}) {
  if (data.length < 2) return <div style={{ width, height }} className={className} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((d, i) => `${i * step},${height - ((d - min) / span) * (height - 2) - 1}`);

  return (
    <svg width={width} height={height} className={cn("overflow-visible", className)} aria-hidden>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={TONE_HEX[tone]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={(data.length - 1) * step} cy={points[points.length - 1]!.split(",")[1]} r={2} fill={TONE_HEX[tone]} />
    </svg>
  );
}
