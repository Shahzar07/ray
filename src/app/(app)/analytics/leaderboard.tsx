import { Flame, Trophy } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { Hint } from "@/components/ui/overlays";
import { cn, pct } from "@/lib/utils";
import type { LeaderboardRow } from "@/lib/queries/dashboard";

export type LeaderRow = LeaderboardRow & { streak: number };

const MEDAL = ["text-warning", "text-subtle", "text-[oklch(0.58_0.14_40)]"];

/**
 * Visible to the whole team by design — the brief is explicit about it. Ranked
 * by conversions, then interested, then dials, so volume alone never tops it.
 */
export function Leaderboard({ rows, rangeLabel, meId }: { rows: LeaderRow[]; rangeLabel: string; meId: string }) {
  const ranked = rows.filter((r) => r.dials > 0 || r.converted > 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-warning" />
            Leaderboard
          </CardTitle>
          <CardDescription>
            Conversions first, then interested, then dials — {rangeLabel.toLowerCase()}.
          </CardDescription>
        </div>
      </CardHeader>

      {ranked.length === 0 ? (
        <div className="border-t border-line p-5">
          <EmptyState compact title="Nothing logged in this range" description="Try a longer range." />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-sunken text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">
                <th scope="col" className="py-2 pl-5 pr-2 font-semibold">
                  #
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Caller
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Dials
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Answered
                </th>
                <th scope="col" className="hidden py-2 pr-3 text-right font-semibold sm:table-cell">
                  Connect
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Interested
                </th>
                <th scope="col" className="hidden py-2 pr-3 text-right font-semibold md:table-cell">
                  Demos
                </th>
                <th scope="col" className="py-2 pr-5 text-right font-semibold">
                  Converted
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {ranked.map((row, i) => (
                <tr key={row.userId} className={cn(row.userId === meId && "bg-accent-soft/40")}>
                  <td className="py-2.5 pl-5 pr-2">
                    {i < 3 ? (
                      <Trophy className={cn("size-4", MEDAL[i])} aria-label={`Rank ${i + 1}`} />
                    ) : (
                      <span className="text-[12px] tabular-nums text-subtle">{i + 1}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={row.name} src={row.avatarUrl} size="sm" />
                      <span className="min-w-0 truncate font-medium text-strong">{row.name ?? "Unknown"}</span>
                      {row.userId === meId && (
                        <Badge tone="accent" size="xs">
                          you
                        </Badge>
                      )}
                      {row.streak >= 3 && (
                        <Hint label={`${row.streak} days in a row with calls logged`}>
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning-text ring-1 ring-inset ring-warning/25">
                            <Flame className="size-3" />
                            {row.streak}
                          </span>
                        </Hint>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-body">{row.dials.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-body">{row.answered.toLocaleString()}</td>
                  <td className="hidden py-2.5 pr-3 text-right tabular-nums text-muted sm:table-cell">
                    {pct(row.answered, row.dials)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-body">{row.interested.toLocaleString()}</td>
                  <td className="hidden py-2.5 pr-3 text-right tabular-nums text-muted md:table-cell">
                    {row.demosScheduled.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-5 text-right">
                    <span className="font-semibold tabular-nums text-strong">{row.converted.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
