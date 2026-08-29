import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  redirect((await hasAnyUser()) ? "/today" : "/setup");
}
