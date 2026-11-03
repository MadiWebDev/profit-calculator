/**
 * OpenRouter + Groq provider tests for /api/ai-insights.
 *
 * Covers the traps that would silently break AI insights after the
 * OpenAI removal:
 *  1. Provider selection: explicit AI_PROVIDER wins; otherwise the
 *     configured key decides; no key at all means "not configured".
 *  2. Fallback: a failing primary tries the second provider instead
 *     of failing the whole request.
 *  3. Both providers failing surfaces an error naming both, never a key.
 *  4. Insight parsing: fences stripped, unknown types coerced to info,
 *     capped at 5 items, unparseable JSON throws for the fallback path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveAiProviders,
  generateAiCompletion,
  parseInsights,
  type AiProviderConfig,
} from "@/lib/ai-providers";

function mockFetch(handler: (url: string, init: { headers: Record<string, string>; body: string }) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => handler(url, init)),
  );
}

function okJson(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

function httpError(status: number, body = "") {
  return { ok: false, status, text: async () => body, json: async () => ({}) };
}

const CHAT_PAYLOAD = {
  choices: [{ message: { content: '{"insights":[{"type":"positive","title":"Margins up","body":"Net margin rose."}]}' } }],
  usage: { total_tokens: 123 },
};

const SAVED_ENV = { ...process.env };

beforeEach(() => {
  vi.unstubAllGlobals();
  for (const key of ["AI_PROVIDER", "OPENROUTER_API_KEY", "GROQ_API_KEY", "OPENROUTER_MODEL", "GROQ_MODEL", "NEXT_PUBLIC_SITE_URL"]) {
    delete process.env[key];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(process.env)) {
    if (!(key in SAVED_ENV)) delete process.env[key];
  }
  Object.assign(process.env, SAVED_ENV);
});

describe("resolveAiProviders", () => {
  it("returns null when no provider key is set", () => {
    expect(resolveAiProviders()).toBeNull();
  });

  it("auto-detects OpenRouter when only its key is set", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    const providers = resolveAiProviders();
    expect(providers?.map((p) => p.name)).toEqual(["openrouter"]);
    expect(providers?.[0].baseUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("auto-detects Groq when only its key is set", () => {
    process.env.GROQ_API_KEY = "groq-key";
    const providers = resolveAiProviders();
    expect(providers?.map((p) => p.name)).toEqual(["groq"]);
    expect(providers?.[0].baseUrl).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("honours AI_PROVIDER=groq over the default order", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.GROQ_API_KEY = "groq-key";
    process.env.AI_PROVIDER = "groq";
    expect(resolveAiProviders()?.map((p) => p.name)).toEqual(["groq", "openrouter"]);
  });

  it("uses env model overrides", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_MODEL = "custom/or-model";
    process.env.GROQ_MODEL = "custom-groq-model";
    const providers = resolveAiProviders();
    expect(providers?.find((p) => p.name === "openrouter")?.model).toBe("custom/or-model");
    expect(providers?.find((p) => p.name === "groq")?.model).toBe("custom-groq-model");
  });

  it("ignores an invalid AI_PROVIDER instead of crashing", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.AI_PROVIDER = "openai";
    expect(resolveAiProviders()?.map((p) => p.name)).toEqual(["openrouter"]);
  });
});

describe("generateAiCompletion", () => {
  const openrouter: AiProviderConfig = {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: "or-key",
    model: "test/or-model",
    extraHeaders: { "HTTP-Referer": "https://getprofitcalc.com", "X-Title": "GetProfitCalc" },
  };
  const groq: AiProviderConfig = {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: "groq-key",
    model: "test-groq-model",
    extraHeaders: {},
  };

  it("calls the primary provider with its key and model, and returns usage", async () => {
    let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
    mockFetch((url, init) => {
      seen = { url, headers: init.headers, body: init.body };
      return okJson(CHAT_PAYLOAD);
    });
    const result = await generateAiCompletion("prompt", [openrouter, groq]);
    expect(result).toEqual({ text: CHAT_PAYLOAD.choices[0].message.content, provider: "openrouter", model: "test/or-model", tokensUsed: 123 });
    expect(seen!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(seen!.headers.Authorization).toBe("Bearer or-key");
    expect(seen!.headers["HTTP-Referer"]).toBe("https://getprofitcalc.com");
    expect(JSON.parse(seen!.body).model).toBe("test/or-model");
  });

  it("falls back to Groq when OpenRouter fails", async () => {
    mockFetch((url) => (url.includes("openrouter") ? httpError(500, "boom") : okJson(CHAT_PAYLOAD)));
    const result = await generateAiCompletion("prompt", [openrouter, groq]);
    expect(result.provider).toBe("groq");
    expect(result.model).toBe("test-groq-model");
  });

  it("throws naming both providers when both fail, without leaking keys", async () => {
    mockFetch(() => httpError(401, "bad auth"));
    await expect(generateAiCompletion("prompt", [openrouter, groq])).rejects.toThrow(/openrouter.*groq|groq.*openrouter/);
    await expect(generateAiCompletion("prompt", [openrouter, groq])).rejects.not.toThrow(/or-key|groq-key/);
  });

  it("throws on an empty completion", async () => {
    mockFetch(() => okJson({ choices: [{ message: { content: "" } }] }));
    await expect(generateAiCompletion("prompt", [openrouter])).rejects.toThrow(/empty completion/);
  });
});

describe("parseInsights", () => {
  it("strips fences, coerces unknown types, and caps at 5", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ type: i === 0 ? "bogus" : "positive", title: `T${i}`, body: `B${i}` }));
    const items = parseInsights(`\`\`\`json\n${JSON.stringify({ insights: many })}\n\`\`\``);
    expect(items).toHaveLength(5);
    expect(items[0].type).toBe("info");
    expect(items[1].title).toBe("T1");
  });

  it("returns [] when insights is not an array", () => {
    expect(parseInsights('{"insights": "nope"}')).toEqual([]);
  });

  it("throws on unparseable JSON so the route can serve fallbacks", () => {
    expect(() => parseInsights("not json at all")).toThrow();
  });
});
