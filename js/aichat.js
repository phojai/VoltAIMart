/* ============================================================
   VoltAIMart — AI Chat Assistant
   Floating chat FAB + slide-up panel, replacing the old voice-only
   assistant (js/voice.js, now unused). Talks to POST /api/chat,
   which runs an LLM (Claude / OpenAI / Gemini — whichever an admin
   has configured in Dashboard → AI Settings) with two tools:
     - a live search over VoltAIMart's own product catalog
     - a live web search (needs a search API key too)
   Works from: the floating chat FAB and the nav/hero "mic" buttons
   present on every storefront page (now repurposed as chat triggers).
   ============================================================ */

(function(){
  let history = [];   // [{role:"user"|"assistant", content:"..."}]
  let sending = false;

  function injectWidget(){
    if (document.getElementById("aiChatFab")) return;

    const fab = document.createElement("button");
    fab.className = "ai-chat-fab";
    fab.id = "aiChatFab";
    fab.title = "Ask VoltAI";
    fab.innerHTML = "💬";
    document.body.appendChild(fab);

    const panel = document.createElement("div");
    panel.className = "ai-chat-panel";
    panel.id = "aiChatPanel";
    panel.innerHTML = `
      <div class="ai-chat-head">
        <div class="ai-chat-head-title"><span class="ai-chat-dot"></span> VoltAI Assistant</div>
        <button class="ai-chat-close" id="aiChatClose">✕</button>
      </div>
      <div class="ai-chat-body" id="aiChatBody">
        <div class="ai-msg ai-msg-bot">Hi, I'm VoltAI. Ask me about products, prices, or anything else — I can search the live catalog and the web.</div>
      </div>
      <div class="ai-chat-hints" id="aiChatHints">
        <span class="voice-hint-chip">Show me headphones under $100</span>
        <span class="voice-hint-chip">What's trending in laptops?</span>
        <span class="voice-hint-chip">Where's my cart?</span>
      </div>
      <form class="ai-chat-input-row" id="aiChatForm">
        <input type="text" id="aiChatInput" class="ai-chat-input" placeholder="Ask VoltAI…" autocomplete="off">
        <button type="submit" class="ai-chat-send" id="aiChatSend" title="Send">➤</button>
      </form>
    `;
    document.body.appendChild(panel);

    fab.addEventListener("click", openPanel);
    document.getElementById("aiChatClose").addEventListener("click", closePanel);
    document.getElementById("aiChatForm").addEventListener("submit", onSubmit);
    document.getElementById("aiChatHints").addEventListener("click", (e) => {
      const chip = e.target.closest(".voice-hint-chip");
      if (!chip) return;
      document.getElementById("aiChatInput").value = chip.textContent;
      onSubmit(new Event("submit", { cancelable: true }));
    });
  }

  function openPanel(){
    document.getElementById("aiChatPanel").classList.add("open");
    document.getElementById("aiChatFab").classList.add("hide");
    setTimeout(() => {
      const input = document.getElementById("aiChatInput");
      if (input) input.focus();
    }, 150);
  }

  function closePanel(){
    document.getElementById("aiChatPanel").classList.remove("open");
    document.getElementById("aiChatFab").classList.remove("hide");
  }

  function appendMessage(role, text){
    const body = document.getElementById("aiChatBody");
    const div = document.createElement("div");
    div.className = `ai-msg ${role === "user" ? "ai-msg-user" : "ai-msg-bot"}`;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function escapeHtml(str){
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // Renders clickable product cards under a bot reply — the server already
  // de-dupes whatever search_catalog surfaced this turn, so the assistant
  // never has to (and never needs to) paste a raw link itself.
  function appendProductChips(products){
    if (!products || !products.length) return;
    const body = document.getElementById("aiChatBody");
    const row = document.createElement("div");
    row.className = "ai-product-chips";
    row.innerHTML = products.map(p => `
      <a class="ai-product-chip" href="${escapeHtml(p.url || `product.html?id=${p.id}`)}">
        <span class="ai-product-chip-icon">${escapeHtml(p.icon || "📦")}</span>
        <span class="ai-product-chip-info">
          <span class="ai-product-chip-name">${escapeHtml(p.name)}</span>
          <span class="ai-product-chip-price">$${Number(p.price || 0).toLocaleString()}</span>
        </span>
      </a>
    `).join("");
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  function appendTyping(){
    const body = document.getElementById("aiChatBody");
    const div = document.createElement("div");
    div.className = "ai-msg ai-msg-bot ai-msg-typing";
    div.id = "aiChatTyping";
    div.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function removeTyping(){
    const el = document.getElementById("aiChatTyping");
    if (el) el.remove();
  }

  async function onSubmit(e){
    if (e && e.preventDefault) e.preventDefault();
    if (sending) return;

    const input = document.getElementById("aiChatInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    const hints = document.getElementById("aiChatHints");
    if (hints) hints.style.display = "none";

    appendMessage("user", text);
    history.push({ role: "user", content: text });
    sending = true;
    appendTyping();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      let data = null;
      try { data = await res.json(); } catch (e){ data = null; }
      removeTyping();

      if (!res.ok){
        appendMessage("bot", (data && data.error) || "Something went wrong reaching VoltAI. Try again in a moment.");
        history.pop();
        return;
      }
      const reply = (data && data.reply) || "…";
      appendMessage("bot", reply);
      appendProductChips(data && data.products);
      history.push({ role: "assistant", content: reply });
    } catch (err){
      removeTyping();
      appendMessage("bot", "I couldn't reach the server. Check your connection and try again.");
      history.pop();
    } finally {
      sending = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectWidget();
    // Nav / hero "mic" buttons now open the AI chat panel instead of voice input.
    document.querySelectorAll(".mic-btn").forEach(btn => {
      btn.title = "Ask VoltAI";
      btn.innerHTML = "💬";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openPanel();
      });
    });
  });
})();
