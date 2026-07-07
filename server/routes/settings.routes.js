const express = require("express");
const { readDB, writeDB } = require("../db");
const { requireRole } = require("../middleware/auth");
const { encryptSecret, decryptSecret } = require("../lib/secretCrypto");

const router = express.Router();
const PROVIDERS = ["anthropic", "openai", "gemini"];

function mask(plainKey){
  if (!plainKey) return "";
  if (plainKey.length <= 8) return "••••••••";
  return `${plainKey.slice(0, 4)}${"•".repeat(Math.max(4, plainKey.length - 8))}${plainKey.slice(-4)}`;
}

// Looks like a value we already masked and sent back to the client (contains
// the "•" placeholder character) — never persist these, they're not real keys.
function looksMasked(v){
  return typeof v === "string" && v.includes("•");
}

function publicSettings(settings){
  const anthropicPlain = decryptSecret(settings.apiKeys.anthropic);
  const openaiPlain = decryptSecret(settings.apiKeys.openai);
  const geminiPlain = decryptSecret(settings.apiKeys.gemini);
  const searchPlain = decryptSecret(settings.webSearch.apiKey);

  return {
    llmProvider: settings.llmProvider,
    models: settings.models,
    apiKeys: {
      anthropic: mask(anthropicPlain),
      openai: mask(openaiPlain),
      gemini: mask(geminiPlain),
    },
    hasKey: {
      anthropic: !!anthropicPlain,
      openai: !!openaiPlain,
      gemini: !!geminiPlain,
    },
    webSearch: {
      provider: settings.webSearch.provider,
      apiKey: mask(searchPlain),
      hasKey: !!searchPlain,
    },
    vapi: {
      mode: settings.vapi.mode,
      publicKey: mask(settings.vapi.publicKey),
      hasPublicKey: !!settings.vapi.publicKey,
      assistantId: settings.vapi.assistantId,
      inline: settings.vapi.inline,
    },
    updatedAt: settings.updatedAt,
  };
}

// GET /api/settings — admin only
router.get("/", requireRole("admin"), (req, res) => {
  const db = readDB();
  res.json({ settings: publicSettings(db.settings) });
});

// PUT /api/settings — admin only. Masked values (containing "•") are left untouched,
// so the admin doesn't have to re-paste a key just to change the provider dropdown.
// Provider keys and the web-search key are encrypted at rest (see server/lib/secretCrypto.js).
// Pass forgetKeys: ["anthropic", ...] and/or webSearch.forget: true to clear a saved key.
router.put("/", requireRole("admin"), (req, res) => {
  const db = readDB();
  const body = req.body || {};

  if (body.llmProvider && PROVIDERS.includes(body.llmProvider)){
    db.settings.llmProvider = body.llmProvider;
  }
  if (body.models && typeof body.models === "object"){
    for (const p of PROVIDERS){
      if (body.models[p]) db.settings.models[p] = String(body.models[p]).trim();
    }
  }
  if (Array.isArray(body.forgetKeys)){
    for (const p of body.forgetKeys){
      if (PROVIDERS.includes(p)) db.settings.apiKeys[p] = "";
    }
  }
  if (body.apiKeys && typeof body.apiKeys === "object"){
    for (const p of PROVIDERS){
      const v = body.apiKeys[p];
      if (typeof v === "string" && v && !looksMasked(v)){
        db.settings.apiKeys[p] = encryptSecret(v.trim());
      }
    }
  }
  if (body.webSearch && typeof body.webSearch === "object"){
    if (body.webSearch.provider) db.settings.webSearch.provider = body.webSearch.provider;
    if (body.webSearch.forget === true){
      db.settings.webSearch.apiKey = "";
    } else if (typeof body.webSearch.apiKey === "string" && body.webSearch.apiKey && !looksMasked(body.webSearch.apiKey)){
      db.settings.webSearch.apiKey = encryptSecret(body.webSearch.apiKey.trim());
    }
  }

  // --- Voice AI agent (Vapi) — publicKey is intentionally NOT encrypted: it's
  // designed to be embedded client-side (see server/routes/voiceAgent.routes.js). ---
  if (body.vapi && typeof body.vapi === "object"){
    const v = body.vapi;
    if (v.mode === "assistantId" || v.mode === "inline"){
      db.settings.vapi.mode = v.mode;
    }
    if (v.forgetPublicKey === true){
      db.settings.vapi.publicKey = "";
    } else if (typeof v.publicKey === "string" && v.publicKey && !looksMasked(v.publicKey)){
      db.settings.vapi.publicKey = v.publicKey.trim();
    }
    if (typeof v.assistantId === "string"){
      db.settings.vapi.assistantId = v.assistantId.trim();
    }
    if (v.inline && typeof v.inline === "object"){
      const fields = ["firstMessage", "systemPrompt", "modelProvider", "modelName", "voiceProvider", "voiceId"];
      for (const f of fields){
        if (typeof v.inline[f] === "string"){
          db.settings.vapi.inline[f] = v.inline[f].trim();
        }
      }
    }
  }

  db.settings.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ settings: publicSettings(db.settings) });
});

module.exports = router;
