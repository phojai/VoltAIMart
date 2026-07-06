const express = require("express");
const { readDB } = require("../db");
const { searchCatalog } = require("../lib/catalogSearch");
const { runChat } = require("../lib/llm");

const router = express.Router();

const SYSTEM_PROMPT = [
  "You are VoltAI, the shopping assistant embedded in VoltAIMart, an electronics & fashion storefront.",
  "Be concise and helpful (2-5 sentences unless asked for more detail).",
  "When asked about products, prices, or availability, ALWAYS call the search_catalog tool first — never invent product names, prices, ratings, or stock.",
  "When a question needs current information outside the store (reviews, news, comparisons, general facts), call the web_search tool.",
  "If a tool returns an error or nothing useful, say so plainly instead of guessing.",
  "When you do have catalog results, mention specific product names and prices from the tool output.",
].join(" ");

async function webSearch(query, apiKey){
  if (!query) return { error: "No query provided." };
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
  });
  if (!resp.ok){
    const text = await resp.text().catch(() => "");
    throw new Error(`Web search failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return {
    results: (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: (r.content || "").slice(0, 300),
    })),
  };
}

// POST /api/chat — public (no login required to chat with VoltAI)
router.post("/", async (req, res) => {
  const db = readDB();
  const settings = db.settings;
  const provider = settings.llmProvider;
  const apiKey = settings.apiKeys[provider];

  const rawMessages = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
  const messages = rawMessages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);

  if (!messages.length){
    return res.status(400).json({ error: "messages[] is required." });
  }

  if (!apiKey){
    return res.json({
      reply: `AI chat isn't set up yet — an admin needs to add an API key for ${provider} in Dashboard → AI Settings before I can answer questions.`,
      needsSetup: true,
    });
  }

  try {
    const result = await runChat({
      provider,
      apiKey,
      model: settings.models[provider],
      systemPrompt: SYSTEM_PROMPT,
      messages,
      tools: {
        search_catalog: (input) => {
          const results = searchCatalog(db, input || {}).slice(0, 8).map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            department: p.department,
            price: p.price,
            oldPrice: p.oldPrice,
            rating: p.rating,
            tagline: p.tagline,
            badge: p.badge,
          }));
          return { count: results.length, results };
        },
        web_search: async (input) => {
          const key = settings.webSearch.apiKey;
          if (!key){
            return { error: "Web search isn't configured. Ask an admin to add a search API key in Dashboard → AI Settings." };
          }
          return webSearch(input && input.query, key);
        },
      },
    });
    res.json({ reply: result.text, toolCalls: result.toolLog });
  } catch (err){
    console.error("Chat error:", err);
    res.status(502).json({ error: `AI provider error: ${err.message}` });
  }
});

module.exports = router;
