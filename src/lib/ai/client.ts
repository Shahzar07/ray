import "server-only";
import { z } from "zod";
import { aiEnabled, env } from "@/lib/env";

/**
 * The single door to the model. One plain fetch, one Zod-validated JSON reply,
 * and a typed failure instead of an exception — no AI SDK, per the brief.
 *
 * The contract the rest of the app relies on: **this never throws and never
 * blocks a save.** Every caller treats a failure as "no suggestion available"
 * and carries on, so the whole product works with GROQ_API_KEY unset. Swapping
 * Groq for another provider is a change to this file alone.
 */

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 9_000;

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure };

export type AiFailure = "disabled" | "timeout" | "network" | "rate_limited" | "bad_response";

export const AI_MESSAGE: Record<AiFailure, string> = {
  disabled: "AI suggestions are switched off. Add a Groq key in the environment to turn them on.",
  timeout: "The model took too long. Write it in yourself — nothing was lost.",
  network: "Could not reach the model just now.",
  rate_limited: "The free tier is rate-limited right now. Try again in a minute.",
  bad_response: "The model returned something unusable, so it was discarded.",
};

const completion = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

/* Generic over the schema rather than over a bare `T`, so a field with a
   `.default()` is optional on the wire and guaranteed on the way out. */
export async function askAI<S extends z.ZodTypeAny>(options: {
  system: string;
  user: string;
  schema: S;
  /** Keep low — these are structured extractions, not essays. */
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<AiResult<z.output<S>>> {
  if (!aiEnabled) return { ok: false, reason: "disabled" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
    });

    if (response.status === 429) return { ok: false, reason: "rate_limited" };
    if (!response.ok) {
      console.error("[ai] HTTP", response.status, (await response.text()).slice(0, 400));
      return { ok: false, reason: "network" };
    }

    const envelope = completion.safeParse(await response.json());
    if (!envelope.success) return { ok: false, reason: "bad_response" };

    const content = envelope.data.choices[0]?.message.content;
    if (!content) return { ok: false, reason: "bad_response" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { ok: false, reason: "bad_response" };
    }

    /* The schema is the real boundary. A model that invents a status outside
       our enum, or a date in the past, fails here and the caller falls back to
       manual entry — a wrong suggestion is worse than none. */
    const result = options.schema.safeParse(parsed);
    if (!result.success) {
      console.error("[ai] schema rejected the reply:", result.error.issues[0]?.message);
      return { ok: false, reason: "bad_response" };
    }

    return { ok: true, data: result.data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, reason: "timeout" };
    console.error("[ai]", error);
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export { aiEnabled };
