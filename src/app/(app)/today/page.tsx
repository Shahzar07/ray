import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Flame,
  PhoneCall,
  Rocket,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getDialTrend, getTodayBoard, getTodayProgress } from "@/lib/queries/dashboard";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, ProgressRing, SectionTitle, Sparkline, StatTile } from "@/components/ui/display";
import { LeadQueueCard } from "@/components/today/lead-queue-card";
import { fmt } from "@/lib/domain/dates";
import { pctValue } from "@/lib/utils";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const ctx = await requireSession();
  const [board, progress, trend] = await Promise.all([
    getTodayBoard(ctx.user.id, ctx.team.id),
    getTodayProgress(ctx.user.id),
    getDialTrend(ctx.user.id),
  ]);

  const firstName = ctx.user.name.split(" ")[0];
  const hour = Number(fmt(new Date(), "H", ctx.user.timezone));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const queue =
    board.overdue.length + board.dueToday.length + board.trialsPending.length + board.trialsEnding.length;
  const connectRate = pctValue(progress.answered, progress.dials);

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={`${fmt(new Date(), "EEEE d MMMM", ctx.user.timezone)} · ${queue} ${queue === 1 ? "call" : "calls"} waiting on you`}
        actions={
          <Button variant="primary" size="md" asChild>
            <Link href="/call">
              <Rocket />
              Start Call Mode
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-6">
        {/* Targets */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-xs">
            <ProgressRing
              value={progress.dials}
              max={ctx.dailyDialTarget}
              size={62}
              label={progress.dials}
              sublabel={`/ ${ctx.dailyDialTarget}`}
            />
            <div className="min-w-0">
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-subtle">Dials today</p>
              <p className="mt-1 text-[13px] text-body">
                {progress.dials >= ctx.dailyDialTarget
                  ? "Target hit. Anything now is upside."
                  : `${ctx.dailyDialTarget - progress.dials} to go`}
              </p>
              <div className="mt-2">
                <Sparkline data={trend} width={84} height={18} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-xs">
            <ProgressRing
              value={progress.answered}
              max={ctx.dailyConnectTarget}
              size={62}
              tone="success"
              label={progress.answered}
              sublabel={`/ ${ctx.dailyConnectTarget}`}
            />
            <div className="min-w-0">
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-subtle">Connects today</p>
              <p className="mt-1 text-[13px] text-body">
                {progress.dials > 0 ? `${connectRate.toFixed(0)}% connect rate` : "No dials logged yet"}
              </p>
            </div>
          </div>

          <StatTile
            label="Interested"
            value={progress.interested}
            sub="Marked interested today"
            icon={<Flame />}
            tone="accent"
          />
          <StatTile
            label="Demos set up"
            value={progress.demos}
            sub="Demo weeks scheduled today"
            icon={<CalendarCheck />}
            tone="success"
          />
        </section>

        {/* Work queue */}
        <div className="grid gap-6 xl:grid-cols-2">
          <Section
            title="Overdue follow-ups"
            count={board.overdue.length}
            tone="danger"
            icon={<AlarmClock />}
            leads={board.overdue}
            tz={ctx.user.timezone}
            empty="Nothing overdue. That is the whole game."
            cta="/call?view=overdue"
          />

          <Section
            title="Due today"
            count={board.dueToday.length}
            tone="warning"
            icon={<PhoneCall />}
            leads={board.dueToday}
            tz={ctx.user.timezone}
            empty="No follow-ups land today."
            cta="/call?view=due_today"
          />

          <Section
            title="Trials ending in 48 hours"
            count={board.trialsEnding.length}
            tone="accent"
            icon={<Sparkles />}
            leads={board.trialsEnding}
            tz={ctx.user.timezone}
            empty="No demo weeks closing just yet."
            cta="/trials"
          />

          <Section
            title="Ended — needs a decision"
            count={board.trialsPending.length}
            tone="accent"
            icon={<TrendingUp />}
            leads={board.trialsPending}
            tz={ctx.user.timezone}
            empty="Every finished trial has a decision on it."
            cta="/trials"
          />
        </div>

        {/* New leads */}
        <section className="space-y-3">
          <SectionTitle
            count={board.freshLeads.length}
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/leads?view=never_attempted">
                  See all
                  <ArrowRight />
                </Link>
              </Button>
            }
          >
            Fresh leads assigned to you
          </SectionTitle>

          {board.freshLeads.length === 0 ? (
            <EmptyState
              compact
              icon={<CheckCircle2 />}
              title="No untouched leads"
              description="You have worked through everything assigned to you. Ask your team lead to import more."
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {board.freshLeads.slice(0, 6).map((lead) => (
                <LeadQueueCard key={lead.id} lead={lead} tz={ctx.user.timezone} showScore />
              ))}
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}

function Section({
  title,
  count,
  icon,
  leads,
  tz,
  empty,
  cta,
}: {
  title: string;
  count: number;
  tone: "danger" | "warning" | "accent";
  icon: React.ReactNode;
  leads: Awaited<ReturnType<typeof getTodayBoard>>["overdue"];
  tz: string;
  empty: string;
  cta: string;
}) {
  return (
    <section className="space-y-3">
      <SectionTitle
        count={count}
        action={
          count > 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={cta}>
                <Rocket />
                Work these
              </Link>
            </Button>
          )
        }
      >
        <span className="flex items-center gap-1.5 [&_svg]:size-3.5">{icon}</span>
        {title}
      </SectionTitle>

      {leads.length === 0 ? (
        <EmptyState compact icon={<CheckCircle2 />} title="Clear" description={empty} />
      ) : (
        <div className="space-y-2">
          {leads.slice(0, 5).map((lead) => (
            <LeadQueueCard key={lead.id} lead={lead} tz={tz} />
          ))}
          {leads.length > 5 && (
            <Link
              href={cta}
              className="block rounded-lg border border-dashed border-line px-3 py-2 text-center text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-strong"
            >
              + {leads.length - 5} more
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
