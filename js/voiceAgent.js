/* ============================================================
   VoltAIMart — Voice agent (hero search mic)
   Separate from js/aichat.js (the VoltAI Assistant chat FAB) —
   that file and its behavior are intentionally untouched. This
   powers only the homepage hero-search mic button (#heroVoiceBtn).

   Two modes, chosen by an admin in Dashboard → AI Settings → Voice
   agent (config comes from the public GET /api/voice-agent):
     - "vapi": a live voice conversation via the Vapi Web SDK.
     - "simulated": free, browser-based fallback using the Web
       Speech API (SpeechRecognition + SpeechSynthesis) matched
       against a fixed set of hardcoded shopping intents — no API
       key needed. This is also what runs automatically whenever
       "vapi" is selected but not actually configured/working, so
       the mic button never dead-ends.
   ============================================================ */

(function(){
  const btn = document.getElementById("heroVoiceBtn");
  if (!btn) return; // this widget only exists on the homepage hero search

  let vapiClient = null;
  let config = null;
  let callActive = false;

  let recognition = null;
  let listening = false;
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  /* ---------------- Overlay UI (shared by both modes) ---------------- */
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
        <div class="voice-agent-response" id="voiceAgentResponse"></div>
        <div class="voice-agent-hints" id="voiceAgentHints">
          <span class="voice-hint-chip">"Show me headphones"</span>
          <span class="voice-hint-chip">"Open my cart"</span>
          <span class="voice-hint-chip">"Take me to fashion"</span>
        </div>
        <div class="voice-agent-unsupported" id="voiceAgentUnsupported" style="display:none;">
          Voice recognition isn't supported in this browser. Try Chrome or Edge, or type your request below.
        </div>
        <form class="voice-agent-fallback-form" id="voiceAgentFallbackForm" style="display:none;">
          <input type="text" id="voiceAgentFallbackInput" class="auth-input" placeholder="Type what you'd say…">
          <button type="submit" class="btn btn-primary">Go</button>
        </form>
        <button class="btn btn-ghost" id="voiceAgentEndBtn" style="margin-top:14px;">End</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("voiceAgentClose").addEventListener("click", endCall);
    document.getElementById("voiceAgentEndBtn").addEventListener("click", endCall);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) endCall(); });
    document.getElementById("voiceAgentFallbackForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("voiceAgentFallbackInput");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      setTranscript(text);
      handleSimulatedUtterance(text);
    });
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
  function setResponse(text){
    const el = document.getElementById("voiceAgentResponse");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("show", !!text);
  }

  async function loadConfig(){
    try {
      const res = await fetch("/api/voice-agent");
      config = await res.json();
    } catch (e){
      config = { agentMode: "simulated", enabled: false };
    }
    return config;
  }

  // Matches spoken/typed text against a fixed set of shopping shortcuts.
  // Returns { text, redirectUrl } — either may be null if nothing matched,
  // which callers handle differently (see below).
  function computeIntentResponse(rawText){
    const text = (rawText || "").toLowerCase();
    let redirectUrl = null;
    let responseText = null;

    if (/\bcart|checkout|basket\b/.test(text)){
      const n = typeof cartCount === "function" ? cartCount() : 0;
      responseText = `You have ${n} item${n === 1 ? "" : "s"} in your cart. Opening it now.`;
      redirectUrl = "cart.html";
    } else if (/\bhome\b/.test(text)){
      responseText = "Sure, taking you home.";
      redirectUrl = "index.html";
    } else if (typeof DEPARTMENTS !== "undefined" && DEPARTMENTS.length){
      const matchedDept = DEPARTMENTS.find(d => text.includes(d.label.toLowerCase()) || text.includes(d.id));
      if (matchedDept){
        responseText = `Here's our ${matchedDept.label.toLowerCase()} department.`;
        redirectUrl = `products.html?department=${matchedDept.id}`;
      }
    }
    if (!redirectUrl && typeof CATEGORIES !== "undefined" && CATEGORIES.length){
      const matchedCat = CATEGORIES.find(c => text.includes(c.label.toLowerCase()) || text.includes(c.id));
      if (matchedCat){
        responseText = `Here's our ${matchedCat.label.toLowerCase()} lineup.`;
        redirectUrl = `products.html?category=${matchedCat.id}`;
      }
    }
    if (!redirectUrl && typeof searchProducts === "function" && rawText){
      const results = searchProducts(rawText);
      if (results.length){
        responseText = `I found ${results.length} match${results.length === 1 ? "" : "es"} for "${rawText}".`;
        redirectUrl = `products.html?q=${encodeURIComponent(rawText)}`;
      }
    }

    return { text: responseText, redirectUrl };
  }

  /* ---------------- Vapi mode ---------------- */
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

  function ensureVapiClient(){
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
          // Client-side shortcut: jump straight to cart/department/category/
          // search results if the phrase matches one. Anything else is left
          // to Vapi's own AI to answer conversationally — unchanged from
          // the original Vapi-only behavior.
          const { redirectUrl } = computeIntentResponse(msg.transcript);
          if (redirectUrl){
            setStatus("On it — taking you there…");
            setTimeout(() => {
              if (vapiClient && callActive) vapiClient.stop();
              window.location.href = redirectUrl;
            }, 1200);
          }
        }
      }
    });

    return vapiClient;
  }

  async function startVapiCall(){
    const client = ensureVapiClient();
    if (!client){
      if (typeof showToast === "function") showToast("Couldn't load the voice agent. Try again shortly.");
      hideOverlay();
      return;
    }
    setStatus("Connecting…");
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

  /* ---------------- Simulated mode (free, browser-based, hardcoded) ---------------- */
  // The Web Speech API has no real "gender" field on voices, only name/lang —
  // so we match against known female voice names shipped by the major
  // browsers/OSes (Chrome, Edge, Safari, Android). Falls back gracefully to
  // any English voice, then any voice at all, if none of these are installed.
  const FEMALE_VOICE_HINTS = [
    "female", "samantha", "victoria", "karen", "moira", "tessa", "fiona", "susan",
    "allison", "serena", "aria", "jenny", "michelle", "emma", "olivia", "salli",
    "joanna", "kendra", "kimberly", "ivy", "kathy", "amelie", "audrey", "catherine",
    "hazel", "shelley", "sandy", "princess", "zira", "google us english", "google uk english female",
  ];

  function pickVoice(voices){
    if (!voices || !voices.length) return null;
    const english = voices.filter(v => /^en([-_]|$)/i.test(v.lang));
    const pool = english.length ? english : voices;
    const female = pool.find(v => FEMALE_VOICE_HINTS.some(hint => v.name.toLowerCase().includes(hint)));
    return female || pool.find(v => /en-US|en_GB|en-GB/i.test(v.lang)) || pool[0];
  }

  function speakWithVoice(text){
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    utter.pitch = 1.05; // a touch higher — reads more feminine if no named voice matches
    const preferred = pickVoice(window.speechSynthesis.getVoices());
    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  }

  function speak(text){
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Some browsers populate the voice list asynchronously on first use.
    if (!window.speechSynthesis.getVoices().length){
      window.speechSynthesis.onvoiceschanged = () => speakWithVoice(text);
      window.speechSynthesis.getVoices();
    } else {
      speakWithVoice(text);
    }
  }

  function handleSimulatedUtterance(rawText){
    let { text, redirectUrl } = computeIntentResponse(rawText);
    if (!text){
      text = `I couldn't find an exact match for "${rawText}", so here are some of our bestsellers.`;
      redirectUrl = "products.html";
    }
    setStatus("VoltAI");
    setResponse(text);
    speak(text);
    if (redirectUrl){
      setTimeout(() => { window.location.href = redirectUrl; }, 1800);
    }
  }

  function showUnsupportedFallback(){
    setStatus("Voice input unavailable");
    document.getElementById("voiceAgentHints").style.display = "none";
    document.getElementById("voiceAgentUnsupported").style.display = "block";
    document.getElementById("voiceAgentFallbackForm").style.display = "flex";
    const input = document.getElementById("voiceAgentFallbackInput");
    if (input) input.focus();
  }

  function startSimulatedRecognition(){
    setTranscript("");
    setResponse("");

    if (!SpeechRecognitionAPI){
      showUnsupportedFallback();
      return;
    }
    document.getElementById("voiceAgentUnsupported").style.display = "none";
    document.getElementById("voiceAgentFallbackForm").style.display = "none";
    document.getElementById("voiceAgentHints").style.display = "";

    recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    listening = true;
    btn.classList.add("active");
    setStatus("Listening…");

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++){
        transcript += event.results[i][0].transcript;
      }
      setTranscript(transcript);
    };

    recognition.onerror = (event) => {
      listening = false;
      btn.classList.remove("active");
      setStatus(event.error === "not-allowed" ? "Microphone access denied" : "Didn't catch that — try again");
    };

    recognition.onend = () => {
      listening = false;
      btn.classList.remove("active");
      const el = document.getElementById("voiceAgentTranscript");
      const transcript = (el ? el.textContent : "").trim();
      if (transcript){
        handleSimulatedUtterance(transcript);
      } else {
        setStatus("Tap the mic to talk to VoltAI");
      }
    };

    try {
      recognition.start();
    } catch (e){
      listening = false;
      btn.classList.remove("active");
    }
  }

  /* ---------------- Shared entry points ---------------- */
  async function startCall(){
    if (!config) await loadConfig();

    injectOverlay();
    setTranscript("");
    setResponse("");
    showOverlay();

    if (config.agentMode === "vapi"){
      await startVapiCall();
    } else {
      startSimulatedRecognition();
    }
  }

  function endCall(){
    if (vapiClient && callActive){
      vapiClient.stop();
      return;
    }
    if (recognition && listening){
      recognition.stop();
    }
    window.speechSynthesis && window.speechSynthesis.cancel();
    listening = false;
    btn.classList.remove("active");
    hideOverlay();
  }

  btn.addEventListener("click", () => {
    if (callActive || listening){
      endCall();
    } else {
      startCall();
    }
  });
})();
