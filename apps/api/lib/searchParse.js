/* ============================================================
   VoltAIMart — AI semantic search query understanding.

   Converts a natural-language query ("headphones for office meetings
   under ₹5000") into structured filters. Reuses the SAME LLM-calling
   primitive (lib/llm.js runChat) and the SAME configured provider/key
   as the existing VoltAI chat assistant — this file adds a new,
   separate call site, it does not modify chat.routes.js, lib/llm.js,
   or the voice agent in any way.

   No embeddings/vector DB: with ~24 SKUs, an LLM-based structured
   filter extraction (this file) combined with lib/searchScore.js's
   weighted text+engagement ranking gives genuine query understanding
   without standing up vector infrastructure this app has no use for
   yet. If the catalog grows large enough to need real vector
   retrieval, this is the single place that would change.
   ============================================================ */
const { runChat } = require("./llm");
const { decryptSecret } = require("./secretCrypto");

const PARSE_TIMEOUT_MS = 4000;

const SYSTEM_PROMPT = [
  "You extract structured shopping filters from a natural-language product search query.",
  "Reply with ONLY a single JSON object, no prose, no markdown fences.",
  "Shape: { \"category\": string|null, \"use_case\": string|null, \"features\": string[], \"price_max\": number|null, \"price_min\": number|null, \"brand\": string|null, \"keywords\": string[], \"clarify\": string[] }",
  "category must be one of: smartphones, laptops, headphones, wearables, cameras, gaming, tv, accessories, mens, womens, shoes, bags — or null if unclear.",
  "price_max/price_min are plain numbers in INR (strip ₹ and commas), or null.",
  "features is a short list of desired attributes (e.g. \"Noise Cancellation\", \"Good Camera\", \"Lightweight\").",
  "keywords is a short list of plain search terms useful for a fallback keyword search.",
  "clarify is a list of 1-3 short clarifying questions ONLY if the query is too vague to act on (e.g. \"I need a laptop\" with no budget/use-case) — otherwise an empty array.",
  "Never invent a specific product name or price — only extract what the user actually said.",
].join(" ");

function looksLikeNaturalLanguage(query){
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  return /\b(for|under|with|best|good|need|gift|beginners?|meeting)\b/i.test(query);
}

function extractJson(text){
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (e){ return null; }
}

/**
 * Attempts to parse a natural-language query into structured filters using
 * the admin-configured LLM provider. Returns null (never throws) if:
 *  - the query doesn't look like natural language,
 *  - no provider/API key is configured,
 *  - the call fails or times out,
 *  - the reply isn't valid JSON.
 * Callers must treat null as "fall back to keyword search only".
 */
async function parseSemanticQuery(query, settings){
  if (!query || !looksLikeNaturalLanguage(query)) return null;

  const provider = settings.llmProvider;
  const apiKey = decryptSecret(settings.apiKeys[provider]);
  if (!apiKey) return null;

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PARSE_TIMEOUT_MS));
  const attempt = (async () => {
    try {
      const result = await runChat({
        provider,
        apiKey,
        model: settings.models[provider],
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: query }],
        tools: {},
      });
      const parsed = extractJson(result.text);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        category: parsed.category || null,
        useCase: parsed.use_case || null,
        features: Array.isArray(parsed.features) ? parsed.features.slice(0, 6) : [],
        priceMax: typeof parsed.price_max === "number" ? parsed.price_max : null,
        priceMin: typeof parsed.price_min === "number" ? parsed.price_min : null,
        brand: parsed.brand || null,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
        clarify: Array.isArray(parsed.clarify) ? parsed.clarify.slice(0, 3) : [],
      };
    } catch (e){
      console.error("Semantic search parse failed (falling back to keyword search):", e.message);
      return null;
    }
  })();

  return Promise.race([attempt, timeout]);
}

module.exports = { parseSemanticQuery, looksLikeNaturalLanguage };
