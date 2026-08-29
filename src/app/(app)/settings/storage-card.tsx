import { Database, HardDrive } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/display";
import { Badge } from "@/components/ui/badge";
import type { StorageUsage } from "@/lib/queries/settings";

function mb(bytes: number) {
  return bytes / (1024 * 1024);
}

/**
 * The brief's warning light: Neon's free tier is 0.5 GB, and a number on a
 * page beats discovering the ceiling as an outage.
 */
export function StorageCard({ usage }: { usage: StorageUsage }) {
  const used = mb(usage.bytes);
  const limit = mb(usage.limitBytes);
  const ratio = used / limit;
  const tone = ratio > 0.85 ? "danger" : ratio > 0.6 ? "warning" : "success";

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4 text-subtle" />
            Database size
          </CardTitle>
          <CardDescription>
            Against Neon&rsquo;s 512 MB free tier. The same schema runs unchanged on Supabase free or a small VPS if
            you ever outgrow it.
          </CardDescription>
        </div>
        <Badge tone={tone} size="md" dot>
          {ratio < 0.01 ? "<1%" : `${Math.round(ratio * 100)}%`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="stat-value text-[22px] font-semibold leading-none tracking-tight text-strong">
              {used < 10 ? used.toFixed(1) : Math.round(used)} MB
            </span>
            <span className="text-[12.5px] text-muted">of {Math.round(limit)} MB</span>
          </div>
          <div className="mt-2.5">
            <ProgressBar value={usage.bytes} max={usage.limitBytes} tone={tone} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-line pt-3 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Database className="size-3.5 text-subtle" />
            {usage.leads.toLocaleString()} leads
          </span>
          <span>{usage.activities.toLocaleString()} activity rows</span>
        </div>
      </CardContent>
    </Card>
  );
}
