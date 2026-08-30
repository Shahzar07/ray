"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormState } from "@/lib/actions/auth";
import type { Role } from "@/lib/db/schema";
import { can, type Capability } from "@/lib/domain/roles";

/* Each tab names the capability that opens it, so the tab strip and the page
   guards agree by construction rather than by both being kept in step. */
export const SETTINGS_TABS = [
  { href: "/settings", label: "General", capability: "team.settings" },
  { href: "/settings/team", label: "Team & access", capability: "members.manage" },
  { href: "/settings/fields", label: "Custom fields", capability: "data.curate" },
  { href: "/settings/dnc", label: "Do-not-call", capability: "data.curate" },
  { href: "/settings/profile", label: "Your profile", capability: null },
] as const satisfies ReadonlyArray<{ href: string; label: string; capability: Capability | null }>;

export function SettingsNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const tabs = SETTINGS_TABS.filter((tab) => tab.capability === null || can(role, tab.capability));

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Settings sections">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              active
                ? "border-accent text-strong"
                : "border-transparent text-muted hover:border-line-strong hover:text-strong",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The one place a server action's result is rendered, so every form agrees. */
export function FormAlert({ state }: { state: FormState }) {
  if (state.ok && state.message) {
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-xl border border-success/25 bg-success-soft px-3.5 py-2.5 text-[13px] text-success-text"
      >
        <CheckCircle2 className="mt-px size-4 shrink-0" />
        {state.message}
      </div>
    );
  }
  if (!state.ok && state.error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger-text"
      >
        <AlertCircle className="mt-px size-4 shrink-0" />
        {state.error}
      </div>
    );
  }
  return null;
}

export function SettingsRow({
  label,
  description,
  children,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-6", className)}>
      <div className="min-w-0 sm:w-1/2">
        <p className="text-[13.5px] font-medium text-strong">{label}</p>
        {description && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{description}</p>}
      </div>
      <div className="sm:flex-1">{children}</div>
    </div>
  );
}
