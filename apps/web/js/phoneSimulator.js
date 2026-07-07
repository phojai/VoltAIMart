/* ============================================================
   VoltAIMart — Phone simulator (header call button, #phoneSimBtn)
   Places a real outgoing call via the Vapi Web SDK (js/vapiCall.js)
   using the SAME admin-configured Vapi settings as the homepage hero
   mic (js/voiceAgent.js) — see GET /api/voice-agent. Unlike the hero
   mic (single evolving line for the caller's own utterance, used to
   redirect to a search result), this shows a scrolling two-sided
   transcript log ("You" / "VoltAI") for the whole call, styled as an
   outgoing-call screen (ringing → connected w/ timer → ended).

   Known limitation: this button and the hero mic each hold their own
   independent Vapi client. On index.html (the only page with both),
   starting both at once is unsupported — not building cross-widget
   locking for it.
   ============================================================ */

(function(){
  const btn = document.getElementById("phoneSimBtn");
  if (!btn) return; // this button isn't present on every page

  let config = null;
  let client = null;
  let callActive = false;
  let timerInterval = null;
  let callSeconds = 0;
  let currentLineEl = { user: null, assistant: null };

  /* ---------------- Overlay UI ---------------- */
  function injectOverlay(){
    if (document.getElementById("callSimOverlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "call-sim-overlay";
    overlay.id = "callSimOverlay";
    overlay.innerHTML = `
      <div class="call-sim-panel" id="callSimPanel">
        <button class="call-sim-close" id="callSimClose">✕</button>

        <div id="callSimConfigured">
          <div class="call-sim-avatar">📞</div>
          <div class="call-sim-status" id="callSimStatus">Calling VoltAI Assistant…</div>
          <div class="call-sim-timer" id="callSimTimer">00:00</div>
          <div class="call-sim-waveform">
            <span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="call-sim-transcript-log" id="callSimLog"></div>
        </div>

        <div id="callSimNotConfigured" style="display:none;">
          <div class="call-sim-avatar">📞</div>
          <div class="call-sim-status">Outgoing call demo isn't set up yet</div>
          <p class="call-sim-not-configured">
            An admin needs to configure a Vapi voice agent in
            Dashboard → AI Settings → Voice agent before this button can place a real call.
          </p>
        </div>

        <button class="btn btn-ghost" id="callSimEndBtn" style="margin-top:14px;">End call</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("callSimClose").addEventListener("click", endCall);
    document.getElementById("callSimEndBtn").addEventListener("click", endCall);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) endCall(); });
  }

  function showOverlay(){
    const o = document.getElementById("callSimOverlay");
    if (o) o.classList.add("open");
  }
  function hideOverlay(){
    const o = document.getElementById("callSimOverlay");
    if (o) o.classList.remove("open");
  }
  function setPanelState(state){
    const panel = document.getElementById("callSimPanel");
    if (panel) panel.className = "call-sim-panel " + state;
  }
  function setStatus(text){
    const el = document.getElementById("callSimStatus");
    if (el) el.textContent = text;
  }

  function showConfiguredView(){
    document.getElementById("callSimConfigured").style.display = "";
    document.getElementById("callSimNotConfigured").style.display = "none";
    document.getElementById("callSimEndBtn").textContent = "End call";
  }
  function showNotConfigured(){
    document.getElementById("callSimConfigured").style.display = "none";
    document.getElementById("callSimNotConfigured").style.display = "";
    document.getElementById("callSimEndBtn").textContent = "Close";
    setPanelState("not-configured");
  }
  function showRinging(){
    showConfiguredView();
    setPanelState("ringing");
    setStatus("Calling VoltAI Assistant…");
  }
  function showConnected(){
    setPanelState("connected");
    setStatus("Connected");
  }
  function showEnded(){
    setPanelState("ended");
    setStatus("Call ended");
  }

  /* ---------------- Duration timer ---------------- */
  function startTimer(){
    callSeconds = 0;
    updateTimerEl();
    timerInterval = setInterval(() => {
      callSeconds++;
      updateTimerEl();
    }, 1000);
  }
  function updateTimerEl(){
    const el = document.getElementById("callSimTimer");
    if (!el) return;
    const m = String(Math.floor(callSeconds / 60)).padStart(2, "0");
    const s = String(callSeconds % 60).padStart(2, "0");
    el.textContent = `${m}:${s}`;
  }
  function stopTimer(){
    clearInterval(timerInterval);
    timerInterval = null;
  }

  /* ---------------- Transcript log ---------------- */
  function resetLog(){
    const log = document.getElementById("callSimLog");
    if (log) log.innerHTML = "";
    currentLineEl = { user: null, assistant: null };
  }
  function appendOrUpdateLine(role, text, isFinal){
    const log = document.getElementById("callSimLog");
    if (!log) return;
    const roleClass = role === "assistant" ? "call-sim-line-agent" : "call-sim-line-you";
    const label = role === "assistant" ? "VoltAI" : "You";

    let lineEl = currentLineEl[role];
    if (!lineEl){
      lineEl = document.createElement("div");
      lineEl.className = `call-sim-line ${roleClass}`;
      lineEl.innerHTML = `<span class="call-sim-line-label">${label}</span><span class="call-sim-line-text"></span>`;
      log.appendChild(lineEl);
      currentLineEl[role] = lineEl;
    }
    lineEl.querySelector(".call-sim-line-text").textContent = text;
    log.scrollTop = log.scrollHeight;

    if (isFinal) currentLineEl[role] = null;
  }

  /* ---------------- Config ---------------- */
  async function loadConfig(){
    try {
      const res = await fetch("/api/voice-agent");
      config = await res.json();
    } catch (e){
      config = { agentMode: "simulated", enabled: false };
    }
    return config;
  }

  /* ---------------- Call lifecycle ---------------- */
  async function startVapiPhoneCall(){
    client = VapiCall.createClient(config.publicKey, {
      onCallStart: () => {
        callActive = true;
        btn.classList.add("active");
        showConnected();
        startTimer();
      },
      onCallEnd: () => {
        callActive = false;
        btn.classList.remove("active");
        stopTimer();
        showEnded();
      },
      onSpeechStart: () => setStatus("VoltAI is speaking…"),
      onSpeechEnd: () => setStatus("Listening…"),
      onError: () => setStatus("Something went wrong — try again."),
      onMessage: (msg) => {
        if (msg && msg.type === "transcript" && (msg.role === "user" || msg.role === "assistant")){
          appendOrUpdateLine(msg.role, msg.transcript, msg.transcriptType === "final");
        }
      },
    });
    if (!client){
      if (typeof showToast === "function") showToast("Couldn't load the outgoing call demo. Try again shortly.");
      hideOverlay();
      return;
    }
    try {
      if (config.mode === "assistantId" && config.assistantId){
        await client.start(config.assistantId);
      } else {
        await client.start(VapiCall.buildInlineAssistant(config.inline));
      }
    } catch (e){
      console.error("Vapi start failed:", e);
      setStatus("Couldn't start the call — try again.");
    }
  }

  async function startCall(){
    if (!config) await loadConfig();

    injectOverlay();
    resetLog();
    showOverlay();

    if (!config.enabled || config.agentMode !== "vapi"){
      showNotConfigured();
      return;
    }

    showRinging();
    await startVapiPhoneCall();
  }

  function endCall(){
    if (client && callActive){
      client.stop();
      return;
    }
    stopTimer();
    hideOverlay();
  }

  btn.addEventListener("click", () => {
    if (callActive){
      endCall();
    } else {
      startCall();
    }
  });
})();
