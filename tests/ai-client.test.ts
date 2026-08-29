import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * The AI client's contract is the whole reason the app is safe to ship with AI
 * on: it must never throw, and it must never let an unvalidated reply through.
 * These tests hold that contract against every way the call can go wrong.
 *
 * `fetch` is mocked, so nothing here touches Groq or needs a real key.
 */

const schema = z.object({ status: z.enum(["interested", "lost"]), summary: z.string() });

// aiEnabled is read at module load, so the key has to exist before the import.
process.env.GROQ_API_KEY = "test-key-not-real";

type Client = typeof import("@/lib/ai/client");
let askAI: Client["askAI"];

beforeAll(async () => {
  ({ askAI } = await import("@/lib/ai/client"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function reply(content: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    text: async () => "error body",
  });
}

describe("askAI", () => {
  it("returns validated data when the model answers correctly", async () => {
    vi.stubGlobal("fetch", reply({ status: "interested", summary: "Wants the trial next week" }));

    const result = await askAI({ system: "s", user: "u", schema });

    expect(result).toEqual({
      ok: true,
      data: { status: "interested", summary: "Wants the trial next week" },
    });
  });

  it("asks for JSON and sends the key as a bearer token", async () => {
    const fetchMock = reply({ status: "lost", summary: "No budget" });
    vi.stubGlobal("fetch", fetchMock);

    await askAI({ system: "sys", user: "usr", schema });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key-not-real");
  });

  it("rejects a reply that violates the schema rather than passing it through", async () => {
    // A status outside our enum is exactly the failure that would corrupt a lead.
    vi.stubGlobal("fetch", reply({ status: "definitely_buying", summary: "hi" }));

    const result = await askAI({ system: "s", user: "u", schema });

    expect(result).toEqual({ ok: false, reason: "bad_response" });
  });

  it("rejects a reply that is not JSON at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Sure! Here you go:" } }] }),
        text: async () => "",
      }),
    );

    const result = await askAI({ system: "s", user: "u", schema });

    expect(result).toEqual({ ok: false, reason: "bad_response" });
  });

  it("reports the free tier's rate limit distinctly, so the UI can say so", async () => {
    vi.stubGlobal("fetch", reply({}, 429));

    const result = await askAI({ system: "s", user: "u", schema });

    expect(result).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("gives up rather than hanging when the model is slow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      ),
    );

    const result = await askAI({ system: "s", user: "u", schema, timeoutMs: 50 });

    expect(result).toEqual({ ok: false, reason: "timeout" });
  });

  it("never throws when the network itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(askAI({ system: "s", user: "u", schema })).resolves.toEqual({
      ok: false,
      reason: "network",
    });
  });
});

describe("without a key", () => {
  it("is disabled, and does not call out at all", async () => {
    vi.resetModules();
    const previous = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const fresh = await import("@/lib/ai/client");
    const result = await fresh.askAI({ system: "s", user: "u", schema });

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.GROQ_API_KEY = previous;
    vi.resetModules();
  });
});
