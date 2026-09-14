import { requireSession } from "@/lib/auth/session";
import { getLeaderboard } from "@/lib/queries/dashboard";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { localWorkDate } from "@/lib/domain/attendance";
export const metadata = { title: "Leaderboard" };
export default async function LeaderboardPage() {
  const ctx = await requireSession();
  const today = localWorkDate(new Date(), ctx.user.timezone);
  const rows = await getLeaderboard(
    ctx.team.id,
    new Date(`${today.slice(0, 7)}-01T00:00:00Z`),
    new Date(`${today}T23:59:59Z`),
  );
  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle="This month · Ranked by conversions, interest, then calls"
      />
      <PageBody>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-xs text-muted">
              <tr>
                {["Rank", "Teammate", "Conversions", "Interested", "Dials"].map(
                  (h) => (
                    <th className="px-5 py-4" key={h}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr className="border-t border-line" key={r.userId}>
                  <td className="px-5 py-4 text-accent-text">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-5 py-4 font-semibold">
                    {r.name ?? "Team member"}
                  </td>
                  <td className="px-5 py-4">{r.converted}</td>
                  <td className="px-5 py-4">{r.interested}</td>
                  <td className="px-5 py-4">{r.dials}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
