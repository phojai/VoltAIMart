const express = require("express");
const { readDB } = require("../db");

const router = express.Router();

// GET /api/voice-agent — public, no auth.
// Returns the (unmasked) config the browser needs to run the hero-search voice
// agent — either the live Vapi widget or the free browser-based "simulated"
// agent. Vapi's "public key" is designed to be embedded client-side (like a
// Stripe publishable key) — it's not a secret the way the LLM provider keys
// are, so unlike /api/settings this endpoint is intentionally unauthenticated.
router.get("/", async (req, res) => {
  const db = await readDB();
  const vapi = db.settings.vapi;

  const vapiReady = !!vapi.publicKey && (vapi.mode === "inline" || !!vapi.assistantId);
  // If the admin picked "vapi" but never finished configuring it, fall back to
  // the simulated agent instead of leaving the mic button dead.
  const agentMode = vapi.agentMode === "vapi" && vapiReady ? "vapi" : "simulated";

  res.json({
    agentMode,
    enabled: vapiReady,
    mode: vapi.mode,
    publicKey: vapi.publicKey || "",
    assistantId: vapi.assistantId || "",
    inline: vapi.inline,
  });
});

module.exports = router;
