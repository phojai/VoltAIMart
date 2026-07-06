/* ============================================================
   VoltAIMart — Voice AI agent (hero search mic, powered by Vapi)
   Separate from js/aichat.js (the VoltAI Assistant chat FAB) —
   that file and its behavior are intentionally untouched. This
   powers only the homepage hero-search mic button (#heroVoiceBtn),
   opening a live voice conversation via the Vapi Web SDK.

   Config comes from the public GET /api/voice-agent endpoint,
   which an admin fills in from Dashboard → AI Settings → Voice
   Agent (Vapi). Two modes:
     - "assistantId": use an assistant already configured on
       vapi.ai's own dashboard.
     - "inline": build a transient assistant here from admin-set
       first message / system prompt / model / voice fields —
       nothing needs to be pre-created on vapi.ai.

   Requires the Vapi Web SDK <script> tag (see index.html) which
   exposes a global `Vapi` constructor.
   ============================================================ */

(function(){
  const btn = document.getElementById("heroVoiceBtn");
  if (!btn) return; // this widget only exists on the homepage hero search

  let vapiClient = null;
  let config = null;
  let callActive = false;

  function injectOverlay(){
    if (document.getElementById("voiceAgentOverlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "voice-agent-overlay";
    overlay.id = "voiceAgentOverlay";
    overlay.innerHTML = `
      <div class="voice-agent-panel">
        <button class="voice-agent-close" id="voiceAgentClose">✕</button>
        <div class="voice-agent-orb">🎙️</div>
        <div class="voice-agent-status" id="voiceAgentStatus">Connecting…</div>
        <div class="voice-agent-transcript" id="voiceAgentTranscript">&nbsp;</div>
        <button class="btn btn-ghost" id="voiceAgentEndBtn" style="margin-top:6px;">End call</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("voiceAgentClose").addEventListener("click", endCall);
    document.getElementById("voiceAgentEndBtn").addEventListener("click", endCall);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) endCall(); });
  }

  function showOverlay(){
    const o = document.getElementById("voiceAgentOverlay");
    if (o) o.classList.add("open");
  }
  function hideOverlay(){
    const o = document.getElementById("voiceAgentOverlay");
    if (o) o.classList.remove("open");
  }
  function setStatus(text){
    const el = document.getElementById("voiceAgentStatus");
    if (el) el.textContent = text;
  }
  function setTranscript(text){
    const el = document.getElementById("voiceAgentTranscript");
    if (el) el.innerHTML = text ? text : "&nbsp;";
  }

  async function loadConfig(){
    try {
      const res = await fetch("/api/voice-agent");
      config = await res.json();
    } catch (e){
      config = { enabled: false };
    }
    return config;
  }

  function buildInlineAssistant(){
    const inline = (config && config.inline) || {};
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

  function ensureClient(){
    if (vapiClient) return vapiClient;
    if (typeof window.Vapi !== "function"){
      console.error("Vapi Web SDK isn't loaded — check the <script> tag in index.html.");
      return null;
    }
    vapiClient = new window.Vapi(config.publicKey);

    vapiClient.on("call-start", () => {
      callActive = true;
      btn.classList.add("active");
      setStatus("Listening…");
    });
    vapiClient.on("call-end", () => {
      callActive = false;
      btn.classList.remove("active");
      hideOverlay();
    });
    vapiClient.on("speech-start", () => setStatus("VoltAI is speaking…"));
    vapiClient.on("speech-end", () => setStatus("Listening…"));
    vapiClient.on("error", (err) => {
      console.error("Vapi error:", err);
      setStatus("Something went wrong — try again.");
    });
    vapiClient.on("message", (msg) => {
      if (msg && msg.type === "transcript" && msg.role === "user"){
        setTranscript(msg.transcript);
        if (msg.transcriptType === "final"){
          handleUserUtterance(msg.transcript);
        }
      }
    });

    return vapiClient;
  }

  // Same lightweight nav-intent matching the old voice assistant used —
  // lets "open my cart" / "show me laptops" jump straight there, while
  // everything else is left to the LLM's own spoken reply.
  function handleUserUtterance(rawText){
    const text = (rawText || "").toLowerCase();
    let redirectUrl = null;

    if (/\bcart|checkout|basket\b/.test(text)){
      redirectUrl = "cart.html";
    } else if (/\bhome\b/.test(text)){
      redirectUrl = "index.html";
    } else if (typeof DEPARTMENTS !== "undefined" && DEPARTMENTS.length){
      const matchedDept = DEPARTMENTS.find(d => text.includes(d.label.toLowerCase()) || text.includes(d.id));
      if (matchedDept) redirectUrl = `products.html?department=${matchedDept.id}`;
    }
    if (!redirectUrl && typeof CATEGORIES !== "undefined" && CATEGORIES.length){
      const matchedCat = CATEGORIES.find(c => text.includes(c.label.toLowerCase()) || text.includes(c.id));
      if (matchedCat) redirectUrl = `products.html?category=${matchedCat.id}`;
    }
    if (!redirectUrl && typeof searchProducts === "function" && rawText){
      const results = searchProducts(rawText);
      if (results.length) redirectUrl = `products.html?q=${encodeURIComponent(rawText)}`;
    }

    if (redirectUrl){
      setStatus("On it — taking you there…");
      setTimeout(() => {
        if (vapiClient && callActive) vapiClient.stop();
        window.location.href = redirectUrl;
      }, 1200);
    }
  }

  async function startCall(){
    if (!config) await loadConfig();
    if (!config.enabled){
      if (typeof showToast === "function"){
        showToast("Voice agent isn't set up yet — ask an admin to add a Vapi key in Dashboard → AI Settings.");
      }
      return;
    }
    const client = ensureClient();
    if (!client){
      if (typeof showToast === "function") showToast("Couldn't load the voice agent. Try again shortly.");
      return;
    }

    injectOverlay();
    setStatus("Connecting…");
    setTranscript("");
    showOverlay();

    try {
      if (config.mode === "assistantId" && config.assistantId){
        await client.start(config.assistantId);
      } else {
        await client.start(buildInlineAssistant());
      }
    } catch (e){
      console.error("Vapi start failed:", e);
      setStatus("Couldn't start the call — try again.");
    }
  }

  function endCall(){
    if (vapiClient && callActive){
      vapiClient.stop();
    } else {
      hideOverlay();
    }
  }

  btn.addEventListener("click", () => {
    if (callActive){
      endCall();
    } else {
      startCall();
    }
  });
})();
