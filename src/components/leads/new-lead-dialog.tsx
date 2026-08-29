"use client";

import * as React from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Avatar } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { createLead } from "@/lib/actions/leads";
import { LEAD_SOURCE } from "@/lib/domain/constants";
import type { Member } from "./inline-cells";

export function NewLeadDialog({
  open,
  onOpenChange,
  members,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  function submit(formData: FormData) {
    const payload = {
      fullName: String(formData.get("fullName") ?? ""),
      phonePrimary: String(formData.get("phonePrimary") ?? ""),
      company: String(formData.get("company") ?? "") || undefined,
      jobTitle: String(formData.get("jobTitle") ?? "") || undefined,
      email: String(formData.get("email") ?? "") || undefined,
      city: String(formData.get("city") ?? "") || undefined,
      source: String(formData.get("source") ?? "scraped"),
      assignedTo: (String(formData.get("assignedTo") ?? "") || null) as string | null,
    };

    startTransition(async () => {
      const result = await createLead(payload);
      if (result.ok && result.data) {
        setErrors({});
        toast({ title: "Lead added", description: result.message, tone: result.message ? "warning" : "success" });
        onCreated(result.data.id);
      } else if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ title: "Not added", description: result.error, tone: "danger" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add a lead"
        description="For one-offs. Bulk lists belong in the importer."
        className="max-w-[460px]"
      >
        <form action={submit}>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="fullName" error={errors.fullName?.[0]} className="sm:col-span-2">
                <Input id="fullName" name="fullName" required autoFocus placeholder="Ahmed Khan" />
              </Field>
              <Field
                label="Phone"
                htmlFor="phonePrimary"
                hint="Any format"
                error={errors.phonePrimary?.[0]}
                className="sm:col-span-2"
              >
                <Input id="phonePrimary" name="phonePrimary" required placeholder="0300 1234567" inputMode="tel" />
              </Field>
              <Field label="Company" htmlFor="company">
                <Input id="company" name="company" placeholder="Crescent Dental" />
              </Field>
              <Field label="Job title" htmlFor="jobTitle">
                <Input id="jobTitle" name="jobTitle" placeholder="Owner" />
              </Field>
              <Field label="Email" htmlFor="email" error={errors.email?.[0]}>
                <Input id="email" name="email" type="email" placeholder="ahmed@clinic.pk" />
              </Field>
              <Field label="City" htmlFor="city">
                <Input id="city" name="city" placeholder="Karachi" />
              </Field>
              <Field label="Source" htmlFor="source">
                <Select name="source" defaultValue="scraped">
                  <SelectTrigger id="source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_SOURCE).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Assign to" htmlFor="assignedTo">
                <Select name="assignedTo" defaultValue={members[0]?.id}>
                  <SelectTrigger id="assignedTo">
                    <SelectValue placeholder="Me" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <Avatar name={m.name} src={m.avatarUrl} size="xs" />
                          {m.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              <UserPlus />
              Add lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
