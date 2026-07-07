/* ============================================================
   VoltAIMart — AI Chat provider engine.
   Runs a tool-calling loop against Anthropic (Claude), OpenAI,
   or Google Gemini — whichever the admin has configured in
   Dashboard → AI Settings. Two tools are offered to the model:
     - search_catalog: live search over VoltAIMart's own products
     - web_search: live web search (needs a search API key too)
   Uses the platform's built-in fetch (Node 18+) — no SDK deps.
   ============================================================ */

const MAX_TURNS = 5;

const TOOL_DEFS = [
  {
    name: "search_catalog",
    description:
      "Search VoltAIMart's live product catalog (current inventory, prices, ratings). " +
      "Always call this before naming a specific product, price, or availability — never invent catalog details.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search, e.g. 'wireless headphones under ₹8,000'" },
        department: { type: "string", enum: ["electronics", "fashion"] },
        category: { type: "string", description: "A specific category id, e.g. smartphones, laptops, mens, shoes, bags" },
      },
    },
  },
  {
    name: "web_search",
    description:
      "Search the live web for information outside VoltAIMart's catalog (reviews, news, comparisons, general facts). " +
      "Only use this when search_catalog can't answer the question.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

// Logs the FULL error body server-side (nothing truncated, so admins can see
// exactly which quota/limit was hit) and throws a shorter, friendlier message
// for the chat reply / API response.
function raiseApiError(providerLabel, resp, errText){
  console.error(`${providerLabel} raw error response (status ${resp.status}):\n${errText}`);
  if (resp.status === 429){
    throw new Error(
      `${providerLabel} rate limit or quota exceeded (429). This is almost always a per-model free-tier ` +
      `limit — "Pro"/flagship models have much stricter caps (sometimes just a handful of requests per ` +
      `minute or per day) than "Flash"/"mini" models. Try switching to a lighter model in Dashboard → AI ` +
      `Settings, or check your usage on the provider's dashboard. Details: ${errText.slice(0, 500)}`
    );
  }
  throw new Error(`${providerLabel} API error (${resp.status}): ${errText.slice(0, 500)}`);
}

async function runTool(tools, name, input, toolLog){
  const fn = tools[name];
  if (!fn){
    const out = { error: `Unknown tool "${name}".` };
    toolLog.push({ name, input, output: out });
    return out;
  }
  try {
    const out = await fn(input || {});
    toolLog.push({ name, input, output: out });
    return out;
  } catch (e){
    const out = { error: e.message };
    toolLog.push({ name, input, output: out });
    return out;
  }
}

// ---------------- Anthropic (Claude) ----------------
async function runAnthropic({ apiKey, model, systemPrompt, messages, tools }){
  const toolLog = [];
  const anthTools = TOOL_DEFS.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  let convo = messages.map(m => ({ role: m.role, content: m.content }));

  for (let turn = 0; turn < MAX_TURNS; turn++){
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: convo,
        tools: anthTools,
      }),
    });
    if (!resp.ok){
      const errText = await resp.text().catch(() => "");
      raiseApiError("Anthropic", resp, errText);
    }
    const data = await resp.json();
    const blocks = data.content || [];
    const toolUses = blocks.filter(b => b.type === "tool_use");
    const textBlocks = blocks.filter(b => b.type === "text").map(b => b.text).join("\n").trim();

    if (data.stop_reason === "tool_use" && toolUses.length){
      convo.push({ role: "assistant", content: blocks });
      const toolResults = [];
      for (const tu of toolUses){
        const output = await runTool(tools, tu.name, tu.input, toolLog);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(output) });
      }
      convo.push({ role: "user", content: toolResults });
      continue;
    }
    return { text: textBlocks || "I don't have a reply for that.", toolLog };
  }
  return { text: "That took more digging than expected — try rephrasing your question.", toolLog };
}

// ---------------- OpenAI ----------------
async function runOpenAI({ apiKey, model, systemPrompt, messages, tools }){
  const toolLog = [];
  const oaTools = TOOL_DEFS.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  let convo = [{ role: "system", content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))];

  for (let turn = 0; turn < MAX_TURNS; turn++){
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: convo, tools: oaTools, tool_choice: "auto" }),
    });
    if (!resp.ok){
      const errText = await resp.text().catch(() => "");
      raiseApiError("OpenAI", resp, errText);
    }
    const data = await resp.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error("OpenAI returned no message.");

    if (msg.tool_calls && msg.tool_calls.length){
      convo.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls){
        let args = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch (e){ args = {}; }
        const output = await runTool(tools, call.function.name, args, toolLog);
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
      }
      continue;
    }
    return { text: (msg.content || "").trim() || "I don't have a reply for that.", toolLog };
  }
  return { text: "That took more digging than expected — try rephrasing your question.", toolLog };
}

// ---------------- Google Gemini ----------------
async function runGemini({ apiKey, model, systemPrompt, messages, tools }){
  const toolLog = [];
  const geminiTools = [{ functionDeclarations: TOOL_DEFS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
  let contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  for (let turn = 0; turn < MAX_TURNS; turn++){
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: geminiTools,
      }),
    });
    if (!resp.ok){
      const errText = await resp.text().catch(() => "");
      raiseApiError("Gemini", resp, errText);
    }
    const data = await resp.json();
    const candidate = data.candidates && data.candidates[0];
    const parts = (candidate && candidate.content && candidate.content.parts) || [];
    const funcCalls = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text).map(p => p.text).join("\n").trim();

    if (funcCalls.length){
      contents.push({ role: "model", parts });
      const responseParts = [];
      for (const fc of funcCalls){
        const output = await runTool(tools, fc.functionCall.name, fc.functionCall.args, toolLog);
        responseParts.push({ functionResponse: { name: fc.functionCall.name, response: output } });
      }
      contents.push({ role: "function", parts: responseParts });
      continue;
    }
    return { text: textParts || "I don't have a reply for that.", toolLog };
  }
  return { text: "That took more digging than expected — try rephrasing your question.", toolLog };
}

async function runChat({ provider, apiKey, model, systemPrompt, messages, tools }){
  if (provider === "openai") return runOpenAI({ apiKey, model, systemPrompt, messages, tools });
  if (provider === "gemini") return runGemini({ apiKey, model, systemPrompt, messages, tools });
  return runAnthropic({ apiKey, model, systemPrompt, messages, tools });
}

module.exports = { runChat, TOOL_DEFS };
