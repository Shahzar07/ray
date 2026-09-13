"use client";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-[75vh] place-items-center p-6">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-text">
          Raynaters CRM
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-strong">
          We couldn’t load your workspace
        </h1>
        <p className="mt-3 text-sm text-muted">
          Your data has not been changed. Try again in a moment. If this
          continues, contact your workspace administrator.
        </p>
        {error.digest && (
          <p className="mt-4 text-xs text-subtle">Reference: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
