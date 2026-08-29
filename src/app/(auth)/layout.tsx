import { PhoneCall } from "lucide-react";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * Split screen: the form on the left, a quiet product panel on the right that
 * collapses away on mobile.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-accent-fg shadow-xs edge-light">
              <PhoneCall className="size-[17px]" strokeWidth={2.4} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-strong">CallDesk</span>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </main>

        <footer className="text-[11.5px] text-subtle">
          Built for small outbound teams. Runs entirely on free tiers.
        </footer>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-line bg-sunken lg:block">
        <div className="grid-noise absolute inset-0 opacity-60" aria-hidden />
        <div
          className="absolute -right-24 -top-24 size-[420px] rounded-full opacity-[0.09] blur-3xl"
          style={{ background: "var(--accent)" }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent-text">
            Cold calling, organised
          </p>
          <h2 className="mt-4 max-w-md text-[32px] font-semibold leading-[1.15] tracking-tight text-strong">
            Retire the spreadsheet and the WhatsApp group.
          </h2>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-muted">
            Import a scraped sheet, work a prioritised queue on your phone, and watch the 7-day demo
            week convert — with every dial, note and outcome logged automatically.
          </p>

          <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-6">
            {[
              ["Call Mode", "One lead at a time, giant tap targets, auto-advance."],
              ["Demo Week", "Day 1 / 4 / 6 / 7 follow-ups created the moment a trial starts."],
              ["Sheet importer", "Column mapping, phone normalisation, dedupe, one-click undo."],
              ["Visibility you control", "Per-person lead access, asymmetric by design."],
            ].map(([title, body]) => (
              <div key={title}>
                <dt className="text-[13px] font-semibold text-strong">{title}</dt>
                <dd className="mt-1 text-[12.5px] leading-relaxed text-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
