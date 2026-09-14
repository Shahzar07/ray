import Link from "next/link";

export const metadata = { title: "Page not found" };

/**
 * Any URL that does not resolve — a stale bookmark, a mistyped path, a screen
 * that has not been built yet — lands here instead of the bare framework 404.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-[75vh] place-items-center p-6">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-text">
          Raynaters CRM
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-strong">
          That page isn’t here
        </h1>
        <p className="mt-3 text-sm text-muted">
          The link may be out of date, or the screen may not be built yet.
          Everything else in your workspace is unaffected.
        </p>
        <Link
          href="/today"
          className="mt-6 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg"
        >
          Back to Today
        </Link>
      </div>
    </main>
  );
}
