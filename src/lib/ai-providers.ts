/**
 * AI providers for /api/ai-insights — OpenRouter and Groq.
 *
 * OpenAI was removed entirely: no OpenAI SDK, no OpenAI API key, no
 * OpenAI model. Both providers below speak the OpenAI-compatible chat
 * completions shape over plain fetch, so no vendor SDK is needed at all.
 *
 * Provider selection (read at call time, never at module import, so tests
 * and env changes are safe):
 *   1. AI_PROVIDER=openrouter|groq, when set to a valid value, is primary.
 *   2. Otherwise OpenRouter is primary when OPENROUTER_API_KEY is set,
 *      else Groq when GROQ_API_KEY is set.
 *   3. The other configured provider is the fallback. A failure on the
 *      primary (network error, 429, 5xx, unknown model) tries the
 *      fallback before giving up; if both fail, the combined error is
 *      thrown and the route serves its existing fallback insights.
 *
 * Keys are never logged. Error messages carry provider name + HTTP
 * status only, plus a truncated provider error body (which never
 * contains a key).
 *
 * Model defaults are env-overridable (OPENROUTER_MODEL / GROQ_MODEL):
 * if a provider retires a default model, set the env var — no code
 * change is needed.
 */

export type AiProviderName = "openrouter" | "groq";

export interface AiProviderConfig {
  name: AiProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders: Record<string, string>;
}

export interface AiCompletion {
  text: string;
  provider: AiProviderName;
  model: string;
  tokensUsed?: number;
}

export interface AiInsightItem {
  type: "positive" | "warning" | "info";
  title: string;
  body: string;
}

export class AiProviderError extends Error {
  provider: AiProviderName | "config";
  status?: number;
  constructor(provider: AiProviderName | "config", message: string, status?: number) {
    super(message);
    this.name = "AiProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export const OPENROUTER_DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";
export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
const REQUEST_TIMEOUT_MS = 30_000;

function providerConfig(name: AiProviderName, apiKey: string, siteUrl?: string): AiProviderConfig {
  if (name === "openrouter") {
    return {
      name,
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKey,
      model: process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL,
      extraHeaders: {
        ...(siteUrl ? { "HTTP-Referer": siteUrl } : {}),
        "X-Title": "GetProfitCalc",
      },
    };
  }
  return {
    name,
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model: process.env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL,
    extraHeaders: {},
  };
}

/**
 * Resolve the ordered provider list, or null when no provider key is set.
 * An AI_PROVIDER value that is not openrouter/groq is ignored (the
 * auto-detect order is used) rather than crashing the route.
 */
export function resolveAiProviders(): AiProviderConfig[] | null {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const requested = process.env.AI_PROVIDER?.trim().toLowerCase();

  const available: Partial<Record<AiProviderName, AiProviderConfig>> = {};
  if (openRouterKey) available.openrouter = providerConfig("openrouter", openRouterKey, siteUrl);
  if (groqKey) available.groq = providerConfig("groq", groqKey, siteUrl);

  const ordered: AiProviderName[] =
    requested === "openrouter" || requested === "groq"
      ? [requested, requested === "openrouter" ? "groq" : "openrouter"]
      : ["openrouter", "groq"];

  const providers = ordered
    .map((name) => available[name])
    .filter((p): p is AiProviderConfig => Boolean(p));
  return providers.length > 0 ? providers : null;
}

async function callProvider(
  provider: AiProviderConfig,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<AiCompletion> {
  let res: Response;
  try {
    res = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...provider.extraHeaders,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new AiProviderError(provider.name, `${provider.name} request failed: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiProviderError(
      provider.name,
      `${provider.name} returned HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { total_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim() === "") {
    throw new AiProviderError(provider.name, `${provider.name} returned an empty completion`);
  }
  return { text, provider: provider.name, model: provider.model, tokensUsed: data.usage?.total_tokens };
}

/**
 * Try providers in order; the first success wins. Throws an
 * AiProviderError naming every provider that was tried when all fail.
 */
export async function generateAiCompletion(
  prompt: string,
  providers: AiProviderConfig[],
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<AiCompletion> {
  const maxTokens = options.maxTokens ?? 600;
  const temperature = options.temperature ?? 0.3;
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      return await callProvider(provider, prompt, maxTokens, temperature);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new AiProviderError("config", `All AI providers failed: ${failures.join(" | ")}`);
}

/**
 * Parse the model's JSON insight list. Strips markdown fences, keeps at
 * most 5 items, coerces unknown types to "info", and caps title/body
 * lengths exactly as the route's cache write expects. Throws on
 * unparseable JSON so the caller can serve fallback insights.
 */
export function parseInsights(text: string): AiInsightItem[] {
  const clean = text.replace(/```json?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(clean) as { insights?: unknown };
  if (!Array.isArray(parsed.insights)) return [];
  return parsed.insights.slice(0, 5).map((raw) => {
    const item = raw as { type?: unknown; title?: unknown; body?: unknown };
    return {
      type: ["positive", "warning", "info"].includes(String(item.type)) ? (item.type as AiInsightItem["type"]) : "info",
      title: String(item.title ?? "").slice(0, 120),
      body: String(item.body ?? "").slice(0, 2000),
    };
  });
}
