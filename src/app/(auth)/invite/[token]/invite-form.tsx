"use client";

import { useActionState } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { acceptInvite } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/controls";
import { COMMON_TIMEZONES } from "@/lib/domain/dates";

export function InviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInvite, { ok: true });
  const err = (field: string) => state.fieldErrors?.[field]?.[0] ?? null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {!state.ok && state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13px] text-danger-text"
        >
          <AlertCircle className="mt-px size-4 shrink-0" />
          {state.error}
        </div>
      )}

      <Field label="Email" hint="Set by the invite">
        <Input value={email} readOnly disabled />
      </Field>

      <Field label="Your name" htmlFor="name" error={err("name")}>
        <Input id="name" name="name" required autoFocus autoComplete="name" />
      </Field>

      <Field label="Choose a password" htmlFor="password" hint="8 characters minimum" error={err("password")}>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>

      <Field label="Timezone" htmlFor="timezone">
        <Select name="timezone" defaultValue="Asia/Karachi">
          <SelectTrigger id="timezone">
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
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
        Join the team
        <ArrowRight />
      </Button>
    </form>
  );
}
