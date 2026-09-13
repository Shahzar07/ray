import { requireSession } from "@/lib/auth/session";
import { ownSessions } from "@/lib/db/attendance";
import {
  elapsedSeconds,
  formatDuration,
  localWorkDate,
  monthRange,
} from "@/lib/domain/attendance";
import { fmt } from "@/lib/domain/dates";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
export const metadata = { title: "My timesheet" };
export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await requireSession();
  const params = await searchParams;
  const now = new Date();
  let month = params.month ?? localWorkDate(now, ctx.user.timezone).slice(0, 7);
  try {
    monthRange(month);
  } catch {
    month = localWorkDate(now, ctx.user.timezone).slice(0, 7);
  }
  const rows = await ownSessions(ctx.user.id, month);
  const days = Array.from(
    { length: monthRange(month).days },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  )
    .filter((d) => d <= localWorkDate(now, ctx.user.timezone))
    .reverse();
  return (
    <>
      <PageHeader
        title="My timesheet"
        subtitle={`Your daily work record · ${ctx.user.timezone}`}
      />
      <PageBody className="max-w-4xl space-y-5">
        <form className="flex gap-2">
          <label className="sr-only" htmlFor="month">
            Month
          </label>
          <input
            id="month"
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-accent px-4 text-sm text-accent-fg">
            View month
          </button>
        </form>
        <p className="text-xs text-muted">
          Times are in your timezone. Overnight sessions belong to the day you
          checked in. Running durations update when you refresh.
        </p>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {days.map((day) => {
            const sessions = rows.filter((r) => r.localDate === day);
            return (
              <section key={day} className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-strong">
                    {day === localWorkDate(now, ctx.user.timezone)
                      ? "Today"
                      : day}
                  </h2>
                  <span className="text-sm font-semibold tabular-nums">
                    {sessions.length
                      ? formatDuration(
                          sessions.reduce(
                            (n, s) =>
                              n +
                              (s.durationSeconds ??
                                elapsedSeconds(s.startedAt, now)),
                            0,
                          ),
                        )
                      : "—"}
                  </span>
                </div>
                {!sessions.length ? (
                  <p className="mt-2 text-xs text-subtle">
                    No sessions recorded
                  </p>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2 text-sm"
                    >
                      <span className="text-muted">
                        {fmt(s.startedAt, "HH:mm", ctx.user.timezone)} →{" "}
                        {s.endedAt ? (
                          fmt(s.endedAt, "d MMM HH:mm", ctx.user.timezone)
                        ) : (
                          <span className="text-success-text">Running</span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        {formatDuration(
                          s.durationSeconds ?? elapsedSeconds(s.startedAt, now),
                        )}
                      </span>
                      {!s.endedAt &&
                        elapsedSeconds(s.startedAt, now) > 43200 && (
                          <p className="w-full text-xs text-warning-text">
                            Long session. Check out if you have finished
                            working.
                          </p>
                        )}
                    </div>
                  ))
                )}
              </section>
            );
          })}
          {!days.length && (
            <p className="p-8 text-sm text-muted">No days to show yet.</p>
          )}
        </div>
      </PageBody>
    </>
  );
}
