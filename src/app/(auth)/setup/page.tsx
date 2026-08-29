import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { hasAnyUser } from "@/lib/auth/session";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Create your workspace" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-[24px] font-semibold tracking-tight text-strong">Create your workspace</h1>
        <p className="text-[13.5px] leading-relaxed text-muted">
          This is the one-time setup. You become the owner and can invite the rest of the team from
          Settings straight after.
        </p>
      </div>

      <SetupForm />

      <p className="text-[12.5px] text-muted">
        Already set up?{" "}
        <Link href="/login" className="font-medium text-accent-text hover:underline">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
