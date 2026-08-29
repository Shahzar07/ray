import "dotenv/config";

// The tests exercise the visibility layer directly against Postgres; they never
// go through Auth.js, so a placeholder secret is enough to satisfy env parsing.
process.env.AUTH_SECRET ??= "test-secret-test-secret-0000";
