"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { RANGES } from "@/lib/domain/ranges";

/**
 * One filter row, above everything it scopes. Lives in the URL so the server
 * re-queries and every chart, stat and table below re-renders against the same
 * slice — the numbers can never disagree with each other.
 */
export function RangeFilter({
  days,
  children,
  className,
}: {
  days: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function pick(next: number) {
    const query = new URLSearchParams(params.toString());
    query.set("days", String(next));
    startTransition(() => router.replace(`${pathname}?${query.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", pending && "opacity-70 transition-opacity", className)}>
      <div className="flex gap-0.5 rounded-lg bg-inset p-0.5" role="group" aria-label="Date range">
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            onClick={() => pick(range.days)}
            aria-pressed={days === range.days}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors",
              days === range.days ? "bg-surface text-strong shadow-xs" : "text-muted hover:text-strong",
            )}
          >
            {range.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
