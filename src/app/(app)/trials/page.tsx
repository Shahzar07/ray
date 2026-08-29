import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import {
  getTrialBoard,
  getTrialConversionByBatch,
  getTrialConversionByUser,
} from "@/lib/queries/dashboard";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatTile } from "@/components/ui/display";
import { daysUntil } from "@/lib/domain/dates";
import { pct } from "@/lib/utils";
import { ConversionByBatch, ConversionByPerson, TrialAlerts, TrialBoard } from "./trial-board";

export const metadata: Metadata = { title: "Demo Weeks" };
export const dynamic = "force-dynamic";

export default async function TrialsPage() {
  const ctx = await requireSession();
  const [board, byUser, byBatch] = await Promise.all([
    getTrialBoard(ctx.user.id, ctx.team.id),
    getTrialConversionByUser(ctx.team.id),
    getTrialConversionByBatch(ctx.team.id),
  ]);

  const ending = board.active.filter((lead) => {
    const left = daysUntil(lead.trialEndsAt);
    return left !== null && left <= 2;
  });
  const stale = board.pending.filter((lead) => {
    const since = daysUntil(lead.trialEndsAt);
    return since !== null && since < -2;
  });

  const finished = board.converted.length + board.churned.length;
  const inFlight = board.scheduled.length + board.active.length + board.pending.length;
  const total = inFlight + finished;

  return (
    <>
      <PageHeader
        title="Demo Weeks"
        subtitle={
          inFlight > 0
            ? `${inFlight} in flight · ${board.active.length} running right now`
            : "The 7-day free demo is where deals are won or lost"
        }
      />

      <PageBody className="space-y-5">
        {total === 0 ? (
          <EmptyState
            icon={<CalendarClock />}
            title="No demo weeks yet"
            description="When a caller taps “Start the 7-day demo week” in Call Mode, the trial appears here with its day-1, day-4, day-6 and day-7 touches already scheduled."
          />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Running now" value={board.active.length} sub="inside the 7 days" tone="accent" />
              <StatTile
                label="Awaiting a decision"
                value={board.pending.length}
                sub={stale.length > 0 ? `${stale.length} over two days old` : "week is up"}
                tone={board.pending.length > 0 ? "warning" : "neutral"}
              />
              <StatTile label="Converted" value={board.converted.length} sub="paying clients" tone="success" />
              <StatTile
                label="Conversion rate"
                value={pct(board.converted.length, finished)}
                sub={`${board.converted.length} of ${finished} finished trials`}
                tone="success"
              />
            </section>

            <TrialAlerts ending={ending} stale={stale} tz={ctx.user.timezone} />

            <TrialBoard columns={board} tz={ctx.user.timezone} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Who closes the demo week</CardTitle>
                    <CardDescription>Trials converted as a share of trials started.</CardDescription>
                  </div>
                </CardHeader>
                <div className="px-5 pb-3">
                  <ConversionByPerson rows={byUser} />
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Which sheets produce clients</CardTitle>
                    <CardDescription>Conversion traced back to the scrape the lead came from.</CardDescription>
                  </div>
                </CardHeader>
                <div className="px-5 pb-3">
                  <ConversionByBatch rows={byBatch} />
                </div>
              </Card>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
