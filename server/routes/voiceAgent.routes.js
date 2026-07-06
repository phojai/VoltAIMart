const express = require("express");
const { readDB } = require("../db");

const router = express.Router();

// GET /api/voice-agent — public, no auth.
// Returns the (unmasked) config the browser needs to boot the Vapi voice widget.
// Vapi's "public key" is designed to be embedded client-side (like a Stripe
// publishable key) — it's not a secret the way the LLM provider keys are, so
// unlike /api/settings this endpoint is intentionally unauthenticated.
router.get("/", (req, res) => {
  const db = readDB();
  const vapi = db.settings.vapi;

  const enabled = !!vapi.publicKey && (vapi.mode === "inline" || !!vapi.assistantId);

  res.json({
    enabled,
    mode: vapi.mode,
    publicKey: vapi.publicKey || "",
    assistantId: vapi.assistantId || "",
    inline: vapi.inline,
  });
});

module.exports = router;
