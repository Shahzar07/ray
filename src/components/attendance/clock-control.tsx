"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, LogIn, LogOut } from "lucide-react";
import { attendanceStatus, clockIn, clockOut } from "@/lib/actions/attendance";
import { elapsedSeconds, formatDuration } from "@/lib/domain/attendance";
import { Button } from "@/components/ui/button";

export function ClockControl() {
  const router = useRouter();
  const [session, setSession] = useState<{
    id: string;
    startedAt: string;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(0);
  const [offset, setOffset] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const result = await attendanceStatus();
      if (!result.ok) {
        setError(result.error);
        setReady(false);
        return;
      }
      setSession(result.session);
      setOffset(Date.parse(result.serverNow) - Date.now());
      setNow(Date.parse(result.serverNow));
      setReady(true);
      setError("");
    } catch {
      setError("Attendance unavailable. Refresh to retry.");
      setReady(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("attendance")
        : null;
    if (channel) channel.onmessage = () => void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      channel?.close();
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span
        className={`flex items-center gap-2 ${session ? "text-success-text" : "text-muted"}`}
      >
        <Clock3 className="size-4" />
        <span className="font-medium tabular-nums">
          {!ready
            ? "Attendance"
            : session
              ? formatDuration(elapsedSeconds(session.startedAt, new Date(now)))
              : "Off the clock"}
        </span>
        {session && <span className="size-1.5 rounded-full bg-success" />}
      </span>
      <Button
        size="sm"
        variant={session ? "secondary" : "primary"}
        disabled={!ready || pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const result = session
                ? await clockOut(session.id)
                : await clockIn();
              if (!result.ok) {
                setError(result.error);
                return;
              }
              await refresh();
              router.refresh();
              if (typeof BroadcastChannel !== "undefined") {
                const c = new BroadcastChannel("attendance");
                c.postMessage("refresh");
                c.close();
              }
            } catch {
              setError(
                "Connection interrupted. Refresh attendance before retrying.",
              );
              setReady(false);
            }
          })
        }
      >
        {session ? <LogOut /> : <LogIn />}
        {pending ? "Saving…" : session ? "Check out" : "Check in"}
      </Button>
      {error && (
        <span role="status" className="text-xs text-danger-text">
          {error}{" "}
          <button className="underline" onClick={() => void refresh()}>
            Retry
          </button>
        </span>
      )}
    </div>
  );
}
