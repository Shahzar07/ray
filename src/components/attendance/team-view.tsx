"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Download, Radio, Users, ArrowUpRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import {
  elapsedSeconds,
  formatDuration,
  localWorkDate,
} from "@/lib/domain/attendance";
import { Avatar } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";

type Member = {
  id: string;
  name: string | null;
  email: string;
  timezone: string;
  isActive: boolean;
  role: string;
};
type Session = {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  localDate: string;
  durationSeconds: number | null;
  source: string;
};
export function TeamView({
  members,
  sessions,
  month,
  serverNow,
}: {
  members: Member[];
  sessions: Session[];
  month: string;
  serverNow: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"live" | "timesheets">("live");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.parse(serverNow));
  useEffect(() => {
    const base = Date.parse(serverNow),
      start = performance.now();
    setNow(base);
    const tick = setInterval(
      () => setNow(base + performance.now() - start),
      1000,
    );
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [serverNow, router]);
  const rows = useMemo(
    () =>
      members.map((member) => {
        const own = sessions.filter((s) => s.userId === member.id);
        const today = own.filter(
          (s) => s.localDate === localWorkDate(new Date(now), member.timezone),
        );
        const active = own.find((s) => !s.endedAt);
        const seconds = (s: Session) =>
          s.durationSeconds ?? elapsedSeconds(s.startedAt, new Date(now));
        return {
          ...member,
          own,
          active,
          todaySeconds: today.reduce((a, s) => a + seconds(s), 0),
          monthSeconds: own
            .filter((s) => s.localDate.startsWith(month))
            .reduce((a, s) => a + seconds(s), 0),
          workedDays: new Set(
            own
              .filter((s) => s.localDate.startsWith(month))
              .map((s) => s.localDate),
          ).size,
        };
      }),
    [members, sessions, now, month],
  );
  const filtered = rows.filter((r) =>
    `${r.name} ${r.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  const activeCount = rows.filter((r) => r.active).length;
  function download() {
    const cell = (v: string | number) =>
      '"' +
      String(v)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const lines = [
      [
        "Employee",
        "Timezone",
        "Local date",
        "Check in (UTC)",
        "Check out (UTC)",
        "Seconds",
        "Status",
      ],
      ...sessions
        .filter((s) => s.localDate.startsWith(month))
        .map((s) => {
          const member = members.find((m) => m.id === s.userId);
          return [
            member?.name ?? member?.email ?? "Former member",
            member?.timezone ?? "UTC",
            s.localDate,
            s.startedAt,
            s.endedAt ?? "",
            s.durationSeconds ?? elapsedSeconds(s.startedAt, new Date(now)),
            s.endedAt ? s.source : "running",
          ];
        }),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + lines.map((r) => r.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="space-y-6">
      <section className="crm-hero grid gap-6 rounded-2xl p-6 sm:p-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-emerald-300">
            <Radio className="size-4" /> Team pulse
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Great work starts
            <br />
            with showing up.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
            A clear view of your team’s time. See who’s working, review each
            shift, and keep every hour accounted for.
          </p>
        </div>
        <div className="flex items-end gap-8 lg:justify-end">
          <div>
            <p className="text-6xl font-semibold tracking-tighter text-white">
              {activeCount}
              <span className="text-2xl text-slate-400">
                {" "}
                / {members.filter((m) => m.isActive).length}
              </span>
            </p>
            <p className="mt-2 text-sm text-slate-300">Checked in right now</p>
            <div className="mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{
                  width: `${members.length ? (activeCount / members.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: Users,
            label: "Team members",
            value: members.length,
            sub: "In this team",
          },
          {
            icon: Clock3,
            label: "Hours recorded",
            value: formatDuration(rows.reduce((n, r) => n + r.monthSeconds, 0)),
            sub: `Selected month · ${month}`,
          },
          {
            icon: ArrowUpRight,
            label: "Sessions",
            value: sessions.filter((s) => s.localDate.startsWith(month)).length,
            sub: "Every check-in counts as a session",
          },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div
            key={label}
            className="rounded-xl border border-line bg-surface p-5 shadow-xs"
          >
            <div className="flex items-center justify-between text-sm text-muted">
              {label}
              <Icon className="size-4 text-accent-text" />
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-strong tabular-nums">
              {value}
            </p>
            <p className="mt-2 text-xs text-subtle">{sub}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex rounded-lg bg-inset p-1"
          role="tablist"
          aria-label="Attendance view"
        >
          {(["live", "timesheets"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${tab === t ? "bg-surface text-strong shadow-xs" : "text-muted"}`}
            >
              {t === "live" ? "Live presence" : "Timesheets"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Find an employee"
            placeholder="Find an employee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <Button onClick={download}>
            <Download />
            Export CSV
          </Button>
        </div>
      </div>
      {tab === "live" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <article
              key={r.id}
              className={`rounded-xl border bg-surface p-5 shadow-xs ${r.active ? "border-success/40" : "border-line"}`}
            >
              <div className="flex items-center gap-3">
                <Avatar name={r.name ?? r.email} size="md" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-strong">
                    {r.name ?? r.email}
                  </h3>
                  <p className="mt-0.5 text-xs capitalize text-muted">
                    {r.role.replace("_", " ")}
                    {!r.isActive ? " · Inactive" : ""}
                  </p>
                </div>
                <span
                  className={`size-2 rounded-full ${r.active ? "bg-success" : "bg-line-strong"}`}
                />
              </div>
              <div className="my-5 flex items-end justify-between">
                <p className="text-3xl font-semibold tracking-tight text-strong tabular-nums">
                  {r.active
                    ? formatDuration(
                        elapsedSeconds(r.active.startedAt, new Date(now)),
                      )
                    : formatDuration(r.todaySeconds)}
                </p>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${r.active ? "bg-success-soft text-success-text" : "bg-inset text-muted"}`}
                >
                  {r.active
                    ? "Working now"
                    : r.todaySeconds
                      ? "Checked out"
                      : "Not in today"}
                </span>
              </div>
              <div className="border-t border-line pt-3 text-xs text-muted">
                {r.active
                  ? `Checked in ${formatInTimeZone(new Date(r.active.startedAt), r.timezone, "d MMM, HH:mm")}`
                  : "Today’s recorded time"}
                <span className="mt-1 block text-subtle">
                  {r.timezone}
                  {r.active &&
                  elapsedSeconds(r.active.startedAt, new Date(now)) > 43200
                    ? " · Long session — review check-out"
                    : ""}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-xs text-muted">
              <tr>
                {["Employee", "Days worked", "Recorded hours", "Sessions"].map(
                  (h) => (
                    <th className="px-5 py-4 font-medium" key={h}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-5 py-4">
                    <span className="font-medium text-strong">
                      {r.name ?? r.email}
                    </span>
                    <span className="block text-xs text-subtle">
                      {r.timezone}
                    </span>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-accent-text">
                        View shifts
                      </summary>
                      <div className="mt-2 space-y-2">
                        {r.own
                          .filter((s) => s.localDate.startsWith(month))
                          .map((s) => (
                            <p key={s.id} className="text-xs text-muted">
                              {s.localDate} ·{" "}
                              {formatInTimeZone(
                                new Date(s.startedAt),
                                r.timezone,
                                "HH:mm",
                              )}{" "}
                              →{" "}
                              {s.endedAt
                                ? formatInTimeZone(
                                    new Date(s.endedAt),
                                    r.timezone,
                                    "d MMM HH:mm",
                                  )
                                : "Running"}{" "}
                              ·{" "}
                              {formatDuration(
                                s.durationSeconds ??
                                  elapsedSeconds(s.startedAt, new Date(now)),
                              )}
                            </p>
                          ))}
                      </div>
                    </details>
                  </td>
                  <td className="px-5 py-4 tabular-nums">{r.workedDays}</td>
                  <td className="px-5 py-4 font-semibold tabular-nums">
                    {formatDuration(r.monthSeconds)}
                  </td>
                  <td className="px-5 py-4">
                    {r.own.filter((s) => s.localDate.startsWith(month)).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!filtered.length && (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
          No employees match this view.
        </p>
      )}
      <p className="text-xs text-subtle">
        Presence refreshes every 30 seconds. Timesheets use each employee’s
        local check-in date. Running shifts are included in recorded hours.
      </p>
    </div>
  );
}
