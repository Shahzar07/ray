"use client";

import { useActionState } from "react";
import { KeyRound, Save } from "lucide-react";
import { changePassword, updateProfile } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Avatar } from "@/components/ui/controls";
import { RoleBadge } from "@/components/ui/display";
import { COMMON_TIMEZONES, fmt } from "@/lib/domain/dates";
import { FormAlert, SettingsRow } from "../settings-ui";
import type { Role } from "@/lib/db/schema";

export function ProfileForm({
  user,
  role,
  teamName,
}: {
  user: { name: string; email: string; phone: string | null; timezone: string; avatarUrl: string | null };
  role: Role;
  teamName: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, { ok: true });

  return (
    <form action={action}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar name={user.name} src={user.avatarUrl} size="lg" />
            <div>
              <CardTitle>{user.name}</CardTitle>
              <CardDescription className="flex items-center gap-1.5 pt-0.5">
                <RoleBadge role={role} size="xs" /> in {teamName}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-[var(--line)] pt-0">
          {(!state.ok || state.message) && (
            <div className="pb-3.5">
              <FormAlert state={state} />
            </div>
          )}

          <SettingsRow label="Name" description="How you appear on leads and the leaderboard.">
            <Input name="name" defaultValue={user.name} required maxLength={120} />
          </SettingsRow>

          <SettingsRow label="Email" description="Used to sign in. Ask an owner to change it.">
            <Input value={user.email} readOnly disabled className="opacity-60" />
          </SettingsRow>

          <SettingsRow label="Phone" description="Optional — handy for the rest of the team.">
            <Input name="phone" defaultValue={user.phone ?? ""} maxLength={40} inputMode="tel" placeholder="0300 1234567" />
          </SettingsRow>

          <SettingsRow
            label="Your timezone"
            description={`Every time in the app is shown in this zone. Right now that is ${fmt(
              new Date(),
              "h:mm a",
              user.timezone,
            )}.`}
          >
            <Select name="timezone" defaultValue={user.timezone}>
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

          <div className="flex justify-end pt-3.5">
            <Button type="submit" variant="primary" loading={pending}>
              <Save />
              Save profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, { ok: true });

  return (
    <form action={action} key={state.ok && state.message ? "reset" : "editing"}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Password</CardTitle>
            <CardDescription>At least 8 characters. You stay signed in on this device.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <FormAlert state={state} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Current" htmlFor="current" error={state.fieldErrors?.current?.[0]}>
              <Input id="current" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New" htmlFor="next" error={state.fieldErrors?.next?.[0]}>
              <Input id="next" name="next" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Confirm" htmlFor="confirm" error={state.fieldErrors?.confirm?.[0]}>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={pending}>
              <KeyRound />
              Change password
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
