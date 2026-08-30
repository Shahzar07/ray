import "server-only";
import { z } from "zod";
import { aiEnabled, aiModels, env } from "@/lib/env";

/**
 * The single door to the model. One plain fetch, one Zod-validated JSON reply,
 * and a typed failure instead of an exception — no AI SDK, per the brief.
 *
 * The contract the rest of the app relies on: **this never throws and never
 * blocks a save.** Every caller treats a failure as "no suggestion available"
 * and carries on, so the whole product works with OPENROUTER_API_KEY unset.
 * Swapping providers is a change to this file alone.
 *
 * Requests send a `models` array rather than a single id. OpenRouter serves the
 * first model that answers, which is not a nicety on the free tier: measured
 * against a live key, free models 429 constantly and independently of each
 * other, so one id would make every AI surface flaky. The chain is configured
 * in OPENROUTER_MODELS.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/* Free models queue behind paying traffic and are measurably slower than a
   dedicated endpoint. Nothing here blocks a save, so waiting is cheap and a
   tight timeout just throws away good answers. */
const DEFAULT_TIMEOUT_MS = 20_000;

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure };

export type AiFailure =
  | "disabled"
  | "timeout"
  | "network"
  | "rate_limited"
  | "needs_credit"
  | "bad_response";

export const AI_MESSAGE: Record<AiFailure, string> = {
  disabled: "AI suggestions are switched off. Add an OpenRouter key in the environment to turn them on.",
  timeout: "The model took too long. Write it in yourself — nothing was lost.",
  network: "Could not reach the model just now.",
  rate_limited: "Every free model is busy right now. Try again in a minute.",
  needs_credit: "That model needs credit on the OpenRouter account. Nothing was charged.",
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
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        /* OpenRouter uses these for attribution on its dashboard. */
        "HTTP-Referer": env.OPENROUTER_SITE_URL ?? "https://calldesk.local",
        "X-Title": "CallDesk",
      },
      body: JSON.stringify({
        models: aiModels,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1200,
        response_format: { type: "json_object" },
        /* Several free models narrate their reasoning into `content` rather
           than the separate `reasoning` field, so max_tokens runs out mid
           thought and the JSON never arrives (finish_reason: "length"). We
           want a filled-in form, not deliberation — turning it off both fixes
           that and makes the call markedly faster. */
        reasoning: { enabled: false },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
    });

    if (response.status === 429) return { ok: false, reason: "rate_limited" };
    /* 402 is OpenRouter saying the account needs a balance — audio requests do,
       even against a :free model. Distinct from a network fault so the UI can
       say something true about it. */
    if (response.status === 402) return { ok: false, reason: "needs_credit" };
    if (!response.ok) {
      console.error("[ai] HTTP", response.status, (await response.text()).slice(0, 400));
      return { ok: false, reason: "network" };
    }

    const rawJson = await response.json();
    if (process.env.AI_DEBUG === "1") console.error("[ai:debug] raw:", JSON.stringify(rawJson).slice(0, 900));
    const envelope = completion.safeParse(rawJson);
    if (!envelope.success) {
      console.error("[ai] envelope rejected:", envelope.error.issues[0]?.message);
      return { ok: false, reason: "bad_response" };
    }

    const content = envelope.data.choices[0]?.message.content;
    if (!content) return { ok: false, reason: "bad_response" };

    const parsed = extractJson(content);
    if (parsed === undefined) {
      console.error("[ai] reply was not JSON:", content.slice(0, 200));
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

/**
 * Models honour `response_format: json_object` unevenly — several of the free
 * ones wrap the object in a ```json fence or lead with a sentence. Rather than
 * discard an otherwise good answer over packaging, take the outermost JSON
 * object if a direct parse fails. The schema check downstream is unchanged and
 * still decides whether the content is acceptable.
 */
function extractJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    /* fall through to the salvage attempts */
  }

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* keep trying */
    }
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      /* genuinely unusable */
    }
  }

  return undefined;
}

export { aiEnabled };
