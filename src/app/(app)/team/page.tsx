import { requireTeamManager } from "@/lib/auth/session";
import { getTeamAttendance } from "@/lib/queries/attendance";
import { localWorkDate, monthRange } from "@/lib/domain/attendance";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { TeamView } from "@/components/attendance/team-view";
export const metadata = { title: "Team & attendance" };
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; team?: string }>;
}) {
  const ctx = await requireTeamManager();
  const params = await searchParams;
  let month =
    params.month ?? localWorkDate(new Date(), ctx.user.timezone).slice(0, 7);
  try {
    monthRange(month);
  } catch {
    month = localWorkDate(new Date(), ctx.user.timezone).slice(0, 7);
  }
  const data = await getTeamAttendance(month, params.team);
  return (
    <>
      <PageHeader
        title="Team & attendance"
        subtitle="Your people. Their time. One clear picture."
      />
      <PageBody className="space-y-5">
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">
            Month
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong"
            />
          </label>
          <label className="text-xs text-muted">
            Team
            <select
              name="team"
              defaultValue={data.teamId}
              className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong"
            >
              {data.availableTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
            Apply
          </button>
        </form>
        <TeamView
          members={data.members}
          sessions={data.sessions.map((s) => ({
            ...s,
            startedAt: s.startedAt.toISOString(),
            endedAt: s.endedAt?.toISOString() ?? null,
          }))}
          month={month}
          serverNow={data.serverNow}
        />
      </PageBody>
    </>
  );
}
