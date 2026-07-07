/* ============================================================
   VoltAIMart — shared Vapi Web SDK call-lifecycle plumbing.
   Used by js/phoneSimulator.js (the header call-simulator button).

   js/voiceAgent.js (the homepage hero-search mic) has its own,
   independent copy of this same logic — the two are deliberately
   NOT unified. voiceAgent.js is a working, previously-debugged
   feature; refactoring it to share this module would carry
   regression risk for a call path that can't be fully
   runtime-verified without a real Vapi account configured. If the
   Vapi SDK's browser packaging breaks again (see getVapiCtor()
   below), both copies need updating.

   No DOM/UI code lives here — callers own all overlay/status/
   transcript rendering via the `handlers` passed to createClient().
   ============================================================ */

const VapiCall = (function(){
  // The @vapi-ai/web package ships CommonJS-only — no plain browser
  // global bundle — so it must be loaded via an ES module import
  // (see the <script type="module"> block near the top of each page
  // that uses this) which stashes its default export on window.Vapi.
  // That export can itself land as either the constructor directly,
  // or an object wrapping it under `.default` (bundler interop) —
  // defend against both.
  function getVapiCtor(){
    const VapiCtor = typeof window.Vapi === "function"
      ? window.Vapi
      : (window.Vapi && typeof window.Vapi.default === "function" ? window.Vapi.default : null);
    if (!VapiCtor){
      console.error(
        "Vapi Web SDK isn't loaded — window.Vapi is " + typeof window.Vapi + ". " +
        "Check the <script type=\"module\"> block that imports @vapi-ai/web via " +
        "jsDelivr's +esm endpoint (Network tab) — if that import 404s or errors, " +
        "the package's published structure may have changed again."
      );
      return null;
    }
    return VapiCtor;
  }

  function buildInlineAssistant(inline){
    inline = inline || {};
    const assistant = {
      firstMessage: inline.firstMessage || "Hi, I'm VoltAI. How can I help?",
      model: {
        provider: inline.modelProvider || "openai",
        model: inline.modelName || "gpt-4o",
        messages: [
          { role: "system", content: inline.systemPrompt || "You are VoltAI, a helpful voice shopping assistant for an electronics & fashion storefront." },
        ],
      },
    };
    if (inline.voiceProvider && inline.voiceId){
      assistant.voice = { provider: inline.voiceProvider, voiceId: inline.voiceId };
    }
    return assistant;
  }

  /** handlers: { onCallStart, onCallEnd, onSpeechStart, onSpeechEnd, onError, onMessage } — all optional. */
  function createClient(publicKey, handlers){
    handlers = handlers || {};
    const VapiCtor = getVapiCtor();
    if (!VapiCtor) return null;

    const client = new VapiCtor(publicKey);
    client.on("call-start", () => handlers.onCallStart && handlers.onCallStart());
    client.on("call-end", () => handlers.onCallEnd && handlers.onCallEnd());
    client.on("speech-start", () => handlers.onSpeechStart && handlers.onSpeechStart());
    client.on("speech-end", () => handlers.onSpeechEnd && handlers.onSpeechEnd());
    client.on("error", (err) => {
      console.error("Vapi error:", err);
      handlers.onError && handlers.onError(err);
    });
    client.on("message", (msg) => handlers.onMessage && handlers.onMessage(msg));

    return client;
  }

  return { buildInlineAssistant, createClient };
})();
