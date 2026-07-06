const express = require("express");
const { readDB, writeDB } = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
const PROVIDERS = ["anthropic", "openai", "gemini"];

function mask(key){
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

function publicSettings(settings){
  return {
    llmProvider: settings.llmProvider,
    models: settings.models,
    apiKeys: {
      anthropic: mask(settings.apiKeys.anthropic),
      openai: mask(settings.apiKeys.openai),
      gemini: mask(settings.apiKeys.gemini),
    },
    hasKey: {
      anthropic: !!settings.apiKeys.anthropic,
      openai: !!settings.apiKeys.openai,
      gemini: !!settings.apiKeys.gemini,
    },
    webSearch: {
      provider: settings.webSearch.provider,
      apiKey: mask(settings.webSearch.apiKey),
      hasKey: !!settings.webSearch.apiKey,
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
  if (body.apiKeys && typeof body.apiKeys === "object"){
    for (const p of PROVIDERS){
      const v = body.apiKeys[p];
      if (typeof v === "string" && v && !v.includes("•")){
        db.settings.apiKeys[p] = v.trim();
      }
    }
  }
  if (body.webSearch && typeof body.webSearch === "object"){
    if (body.webSearch.provider) db.settings.webSearch.provider = body.webSearch.provider;
    if (typeof body.webSearch.apiKey === "string" && body.webSearch.apiKey && !body.webSearch.apiKey.includes("•")){
      db.settings.webSearch.apiKey = body.webSearch.apiKey.trim();
    }
  }
  db.settings.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ settings: publicSettings(db.settings) });
});

module.exports = router;
