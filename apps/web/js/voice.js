/* ============================================================
   VoltAIMart — Voice AI Assistant
   Uses the browser Web Speech API (SpeechRecognition) for real
   voice input and SpeechSynthesis for a spoken AI reply.
   Falls back to a visual-only mock if the browser doesn't
   support speech recognition (e.g. Firefox, Safari on some OSes).
   Works from: the nav mic button, the hero search mic button,
   and the floating voice FAB present on every page.
   ============================================================ */

(function(){
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;

  function injectOverlay(){
    if (document.querySelector(".voice-overlay")) return;

    const fab = document.createElement("button");
    fab.className = "voice-fab";
    fab.id = "voiceFab";
    fab.title = "Ask VoltAI";
    fab.innerHTML = "🎙️";
    document.body.appendChild(fab);

    const overlay = document.createElement("div");
    overlay.className = "voice-overlay";
    overlay.id = "voiceOverlay";
    overlay.innerHTML = `
      <div class="voice-panel">
        <button class="voice-close" id="voiceClose">✕</button>
        <div class="voice-orb">🎙️</div>
        <div class="voice-status" id="voiceStatusText">Tap the mic to talk to VoltAI</div>
        <div class="voice-waveform">
          ${Array.from({length:8}).map(()=>"<span></span>").join("")}
        </div>
        <div class="voice-transcript" id="voiceTranscript">&nbsp;</div>
        <div class="voice-response" id="voiceResponse"></div>
        <div class="voice-hints" id="voiceHints">
          <span class="voice-hint-chip">"Show me headphones"</span>
          <span class="voice-hint-chip">"Search for laptops"</span>
          <span class="voice-hint-chip">"Open my cart"</span>
        </div>
        <div id="voiceUnsupported" style="display:none;">
          <div class="voice-unsupported">
            Voice recognition isn't supported in this browser. Try Chrome or Edge on desktop/Android.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    fab.addEventListener("click", () => openOverlayAndListen());
    document.getElementById("voiceClose").addEventListener("click", closeOverlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
    document.getElementById("voiceOverlay").querySelector(".voice-orb").addEventListener("click", () => {
      if (!listening) startListening();
    });
  }

  function openOverlayAndListen(){
    const overlay = document.getElementById("voiceOverlay");
    overlay.classList.add("open");
    resetPanel();
    if (SpeechRecognitionAPI){
      startListening();
    } else {
      document.getElementById("voiceUnsupported").style.display = "block";
      document.getElementById("voiceStatusText").textContent = "Voice input unavailable";
    }
  }

  function closeOverlay(){
    const overlay = document.getElementById("voiceOverlay");
    overlay.classList.remove("open", "listening");
    if (recognition && listening){
      recognition.stop();
    }
    window.speechSynthesis && window.speechSynthesis.cancel();
  }

  function resetPanel(){
    document.getElementById("voiceStatusText").textContent = "Listening…";
    document.getElementById("voiceTranscript").innerHTML = "&nbsp;";
    const resp = document.getElementById("voiceResponse");
    resp.textContent = "";
    resp.classList.remove("show");
    document.getElementById("voiceUnsupported").style.display = "none";
  }

  function setMicButtonsListening(isListening){
    document.querySelectorAll(".mic-btn, .voice-fab").forEach(btn => {
      btn.classList.toggle("listening", isListening);
    });
    document.getElementById("voiceOverlay").classList.toggle("listening", isListening);
  }

  function startListening(){
    if (!SpeechRecognitionAPI){
      openOverlayAndListen();
      return;
    }
    const overlay = document.getElementById("voiceOverlay");
    if (!overlay.classList.contains("open")) overlay.classList.add("open");
    resetPanel();

    recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    listening = true;
    setMicButtonsListening(true);

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++){
        transcript += event.results[i][0].transcript;
      }
      document.getElementById("voiceTranscript").textContent = transcript;
    };

    recognition.onerror = (event) => {
      listening = false;
      setMicButtonsListening(false);
      document.getElementById("voiceStatusText").textContent =
        event.error === "not-allowed" ? "Microphone access denied" : "Didn't catch that — try again";
    };

    recognition.onend = () => {
      listening = false;
      setMicButtonsListening(false);
      const transcript = document.getElementById("voiceTranscript").textContent.trim();
      if (transcript && transcript !== ""){
        document.getElementById("voiceStatusText").textContent = "VoltAI";
        handleVoiceQuery(transcript);
      } else {
        document.getElementById("voiceStatusText").textContent = "Tap the mic to talk to VoltAI";
      }
    };

    try {
      recognition.start();
    } catch(e){
      listening = false;
      setMicButtonsListening(false);
    }
  }

  function speak(text){
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    utter.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /en-US|en_GB|en-GB/.test(v.lang)) || voices[0];
    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  }

  function respond(text, redirectUrl){
    const resp = document.getElementById("voiceResponse");
    resp.textContent = text;
    resp.classList.add("show");
    speak(text);
    if (redirectUrl){
      setTimeout(() => { window.location.href = redirectUrl; }, 1800);
    }
  }

  function handleVoiceQuery(rawText){
    const text = rawText.toLowerCase();

    // Navigation intents
    if (/\bcart|checkout|basket\b/.test(text)){
      const n = typeof cartCount === "function" ? cartCount() : 0;
      respond(`You have ${n} item${n === 1 ? "" : "s"} in your cart. Opening it now.`, "cart.html");
      return;
    }
    if (/\bhome\b/.test(text)){
      respond("Sure, taking you home.", "index.html");
      return;
    }

    // Department intents ("show me electronics" / "take me to fashion")
    if (typeof DEPARTMENTS !== "undefined"){
      const matchedDept = DEPARTMENTS.find(d => text.includes(d.label.toLowerCase()) || text.includes(d.id));
      if (matchedDept){
        respond(`Here's our ${matchedDept.label.toLowerCase()} department.`, `products.html?department=${matchedDept.id}`);
        return;
      }
    }

    // Category intents
    if (typeof CATEGORIES !== "undefined"){
      const matchedCat = CATEGORIES.find(c =>
        text.includes(c.label.toLowerCase()) || text.includes(c.id)
      ) || (text.includes("phone") ? CATEGORIES.find(c => c.id === "smartphones") : null)
        || (text.includes("laptop") || text.includes("notebook") ? CATEGORIES.find(c => c.id === "laptops") : null)
        || (text.includes("earbud") || text.includes("headphone") || text.includes("speaker") ? CATEGORIES.find(c => c.id === "headphones") : null)
        || (text.includes("watch") ? CATEGORIES.find(c => c.id === "wearables") : null)
        || (text.includes("camera") ? CATEGORIES.find(c => c.id === "cameras") : null)
        || (text.includes("game") || text.includes("gaming") || text.includes("controller") ? CATEGORIES.find(c => c.id === "gaming") : null)
        || (text.includes("tv") || text.includes("television") ? CATEGORIES.find(c => c.id === "tv") : null)
        || (text.includes("shirt") || text.includes("tee") || text.includes("jacket") || text.includes("hoodie") ? CATEGORIES.find(c => c.id === "mens") : null)
        || (text.includes("dress") || text.includes("trouser") || text.includes("pants") ? CATEGORIES.find(c => c.id === "womens") : null)
        || (text.includes("shoe") || text.includes("sneaker") || text.includes("boot") || text.includes("trainer") ? CATEGORIES.find(c => c.id === "shoes") : null)
        || (text.includes("bag") || text.includes("tote") || text.includes("backpack") || text.includes("duffel") ? CATEGORIES.find(c => c.id === "bags") : null);

      if (matchedCat){
        respond(`Here's our ${matchedCat.label.toLowerCase()} lineup.`, `products.html?category=${matchedCat.id}`);
        return;
      }
    }

    // Free-text product search
    if (typeof searchProducts === "function"){
      const results = searchProducts(text);
      if (results.length){
        respond(`I found ${results.length} match${results.length === 1 ? "" : "es"} for "${rawText}".`, `products.html?q=${encodeURIComponent(rawText)}`);
        return;
      }
    }

    respond(`I couldn't find an exact match for "${rawText}", so here are some of our bestsellers.`, "products.html");
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectOverlay();
    // wire every mic button (nav + hero) to open overlay + listen
    document.querySelectorAll(".mic-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openOverlayAndListen();
      });
    });
    if (window.speechSynthesis){
      window.speechSynthesis.onvoiceschanged = () => {};
    }
  });
})();
