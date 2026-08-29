import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { hasAnyUser } from "@/lib/auth/session";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; next?: string }>;
}) {
  const [session, seeded, params] = await Promise.all([auth(), hasAnyUser(), searchParams]);
  if (session?.user) redirect("/today");
  if (!seeded) redirect("/setup");

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-[24px] font-semibold tracking-tight text-strong">Sign in</h1>
        <p className="text-[13.5px] text-muted">Pick up where you left off.</p>
      </div>

      {params.welcome && (
        <div className="rounded-xl border border-success/25 bg-success-soft px-3.5 py-3 text-[13px] text-success-text">
          Workspace created. Sign in with the owner account you just made.
        </div>
      )}

      <LoginForm />

      <p className="text-[12.5px] text-muted">
        Invited by a teammate?{" "}
        <Link href="/setup" className="font-medium text-accent-text hover:underline">
          Use the invite link they sent you
        </Link>
        .
      </p>
    </div>
  );
}
