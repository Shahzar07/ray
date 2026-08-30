/**
 * Postgres errors that mean something specific to a user, translated once.
 *
 * The case that prompted this: after the manager/researcher/viewer roles
 * shipped, changing someone's role in production failed with a bare
 * "Something went wrong. Try again." The real error was
 * `invalid input value for enum role: "manager"` — the code was deployed but
 * the migration adding those enum values had not been run, so the app was
 * offering roles the database had never heard of. A generic message sent the
 * operator hunting through code that was working correctly.
 */

const PENDING_MIGRATION = "The database has not caught up with this version of the app — a migration is pending. Redeploy, or run `pnpm db:migrate`.";

export function pendingMigrationMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;

  /* Drizzle wraps the driver error, so the useful text is often on `cause`. */
  const cause = (error as { cause?: { message?: string } }).cause;
  const text = `${error.message} ${cause?.message ?? ""}`;

  /* A value the code sends that the enum does not contain, or a column or
     table the code expects and the database does not have. Both mean the same
     thing to whoever has to fix it. */
  const symptoms =
    /invalid input value for enum|column .* does not exist|relation .* does not exist/i;

  return symptoms.test(text) ? PENDING_MIGRATION : null;
}
