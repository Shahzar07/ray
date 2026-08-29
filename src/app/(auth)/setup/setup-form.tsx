"use client";

import { useActionState } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { createFirstOwner } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/controls";
import { COMMON_TIMEZONES } from "@/lib/domain/dates";

export function SetupForm() {
  const [state, action, pending] = useActionState(createFirstOwner, { ok: true });
  const err = (field: string) => state.fieldErrors?.[field]?.[0] ?? null;

  return (
    <form action={action} className="space-y-4">
      {!state.ok && state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13px] text-danger-text"
        >
          <AlertCircle className="mt-px size-4 shrink-0" />
          {state.error}
        </div>
      )}

      <Field label="Company" htmlFor="orgName" error={err("orgName")}>
        <Input id="orgName" name="orgName" required autoFocus placeholder="Nexa AI Receptionist" />
      </Field>

      <Field label="First team" htmlFor="teamName" hint="You can add more later" error={err("teamName")}>
        <Input id="teamName" name="teamName" defaultValue="Outbound" required />
      </Field>

      <div className="h-px bg-line" />

      <Field label="Your name" htmlFor="name" error={err("name")}>
        <Input id="name" name="name" required autoComplete="name" placeholder="Zainab Haider" />
      </Field>

      <Field label="Email" htmlFor="email" error={err("email")}>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
      </Field>

      <Field label="Password" htmlFor="password" hint="8 characters minimum" error={err("password")}>
        <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={8} />
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
        Create workspace
        <ArrowRight />
      </Button>
    </form>
  );
}
