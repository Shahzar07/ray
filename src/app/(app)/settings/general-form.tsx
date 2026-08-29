"use client";

import * as React from "react";
import { useActionState } from "react";
import { Save } from "lucide-react";
import { updateOrgSettings } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@/components/ui/controls";
import { COMMON_TIMEZONES } from "@/lib/domain/dates";
import { FormAlert, SettingsRow } from "./settings-ui";

const HOURS = Array.from({ length: 25 }, (_, h) => h);

function hourLabel(hour: number) {
  if (hour === 0) return "12 midnight";
  if (hour === 12) return "12 noon";
  if (hour === 24) return "midnight";
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

export function GeneralForm({
  org,
}: {
  org: {
    name: string;
    timezone: string;
    callingWindowStart: number;
    callingWindowEnd: number;
    cadenceEnabled: boolean;
    cadenceMaxAttempts: number;
    cadenceWindowDays: number;
  };
}) {
  const [state, action, pending] = useActionState(updateOrgSettings, { ok: true });
  const [start, setStart] = React.useState(String(org.callingWindowStart));
  const [end, setEnd] = React.useState(String(org.callingWindowEnd));
  const [cadence, setCadence] = React.useState(org.cadenceEnabled);

  return (
    <form action={action} className="space-y-5">
      <FormAlert state={state} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Organisation</CardTitle>
            <CardDescription>What the team is called, and the zone the working day is measured in.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-[var(--line)] pt-0">
          <SettingsRow label="Name" description="Shown in the sidebar and on invite links.">
            <Input name="name" defaultValue={org.name} required maxLength={120} />
          </SettingsRow>
          <SettingsRow label="Timezone" description="Reports and daily targets roll over at midnight here.">
            <Select name="timezone" defaultValue={org.timezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Calling window</CardTitle>
            <CardDescription>
              Call Mode only queues a lead when it is inside these hours <strong>in the lead&rsquo;s own timezone</strong> —
              so a Dubai number never surfaces at 3 am there.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From" className="w-40">
              <Select name="callingWindowStart" value={start} onValueChange={setStart}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.slice(0, 24).map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {hourLabel(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Until" className="w-40">
              <Select name="callingWindowEnd" value={end} onValueChange={setEnd}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.slice(1).map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {hourLabel(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <p className="pb-2 text-[12.5px] text-muted">
              {Number(end) > Number(start)
                ? `${Number(end) - Number(start)} hours of calling a day.`
                : "The window has to end after it starts."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Give-up rule</CardTitle>
            <CardDescription>
              Dead numbers clog the queue. Overnight, a lead with this many attempts and no connect is marked Lost —
              it stays in the table, it just stops being offered.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <label className="flex items-center gap-3">
            <Switch name="cadenceEnabled" checked={cadence} onCheckedChange={setCadence} />
            <span className="text-[13.5px] text-body">
              {cadence ? "Retire unreachable leads automatically" : "Keep every lead in the queue forever"}
            </span>
          </label>
          {/* Hidden rather than unmounted, so the numbers still post and are
              remembered when the rule is switched back on. */}
          <div className={cadence ? "flex flex-wrap items-end gap-3" : "hidden"} aria-hidden={!cadence}>
            <Field label="After this many attempts" className="w-48">
              <Input
                name="cadenceMaxAttempts"
                type="number"
                min={1}
                max={50}
                defaultValue={org.cadenceMaxAttempts}
                className="tabular-nums"
              />
            </Field>
            <Field label="Within this many days" className="w-48">
              <Input
                name="cadenceWindowDays"
                type="number"
                min={1}
                max={365}
                defaultValue={org.cadenceWindowDays}
                className="tabular-nums"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          <Save />
          Save settings
        </Button>
      </div>
    </form>
  );
}
