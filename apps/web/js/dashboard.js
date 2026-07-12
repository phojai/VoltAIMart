/* ============================================================
   VoltAIMart — Admin / Agent back-office dashboard
   ============================================================ */

let currentUser = null;
let META = { departments: [], categories: [] };
let editingProductId = null;

function fmtMoney(n){ return `₹${Number(n).toLocaleString('en-IN')}`; }
function fmtDate(iso){ return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }

function renderUserBadge(){
  const el = document.getElementById("dashUser");
  el.innerHTML = `
    <span class="dash-role-pill ${currentUser.role}">${currentUser.role}</span>
    <span class="dash-user-name">${currentUser.name}</span>
    <button class="btn btn-ghost" id="logoutBtn" style="padding:8px 16px; font-size:13px;">Log out</button>
  `;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    Api.logout();
    window.location.href = "login.html";
  });
}

function renderStats(orders, products, users){
  const revenue = orders.reduce((sum, o) => sum + (o.status === "cancelled" ? 0 : o.total), 0);
  const stats = [
    { label: "Orders", value: orders.length, icon: "🧾" },
    { label: "Revenue", value: fmtMoney(revenue), icon: "💰" },
    { label: "Products", value: products.length, icon: "📦" },
  ];
  if (currentUser.role === "admin"){
    stats.push({ label: "Users", value: users.length, icon: "👥" });
  }
  document.getElementById("statGrid").innerHTML = stats.map(s => `
    <div class="stat-card">
      <span class="stat-icon">${s.icon}</span>
      <div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    </div>
  `).join("");
}

/* ---------------- Orders ---------------- */
async function loadOrders(){
  const filter = document.getElementById("orderStatusFilter").value;
  const orders = await Api.getOrders();
  const filtered = filter ? orders.filter(o => o.status === filter) : orders;

  document.getElementById("orderCount").textContent = `${filtered.length} order${filtered.length === 1 ? "" : "s"}`;
  document.getElementById("ordersBody").innerHTML = filtered.map(o => `
    <tr>
      <td><span class="mono">${o.id}</span></td>
      <td>${o.userName || o.userEmail}${o.guest ? ` <span class="tag-inline">GUEST</span>` : ""}<div class="muted" style="font-size:12px;">${o.userEmail}</div>${o.shippingAddress ? `<div class="muted" style="font-size:12px;">📦 ${o.shippingAddress.city} ${o.shippingAddress.pincode}</div>` : ""}</td>
      <td>${o.items.map(i => `${i.icon || ""} ${i.name} ×${i.qty}`).join("<br>")}</td>
      <td>${fmtMoney(o.total)}${o.payment ? `<div class="muted" style="font-size:12px;">${o.payment.method === "upi" ? "UPI" : `Card ••${o.payment.last4 || ""}`}</div>` : ""}</td>
      <td>
        <select class="status-select status-${o.status}" data-order-id="${o.id}">
          ${["processing","shipped","delivered","cancelled"].map(s => `<option value="${s}" ${o.status===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="muted" style="font-size:12.5px;">${fmtDate(o.createdAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="muted" style="text-align:center; padding:30px;">No orders yet.</td></tr>`;

  document.querySelectorAll(".status-select").forEach(sel => {
    sel.addEventListener("change", async (e) => {
      const id = e.target.dataset.orderId;
      try {
        await Api.updateOrderStatus(id, e.target.value);
        e.target.className = `status-select status-${e.target.value}`;
        showToast(`Order ${id} marked ${e.target.value}.`);
        refreshOverviewStats();
      } catch(err){
        showToast(err.message || "Couldn't update order status.");
      }
    });
  });
  return orders;
}

/* ---------------- Products ---------------- */
async function loadProducts(){
  const products = await Api.getProducts();
  document.getElementById("productCount").textContent = `${products.length} product${products.length === 1 ? "" : "s"}`;
  document.getElementById("productsBody").innerHTML = products.map(p => `
    <tr>
      <td style="font-size:22px;">${p.icon}</td>
      <td><span class="mono">${p.id}</span></td>
      <td>${p.name}${p.badge ? ` <span class="tag-inline ${p.badge==='NEW'?'new':''}">${p.badge}</span>` : ""}</td>
      <td class="muted">${categoryLabelSafe(p.category)}</td>
      <td>${fmtMoney(p.price)}${p.oldPrice ? `<div class="muted" style="font-size:12px; text-decoration:line-through;">${fmtMoney(p.oldPrice)}</div>` : ""}</td>
      <td>★ ${p.rating}</td>
      <td style="${p.stock === 0 ? "color:var(--danger); font-weight:700;" : p.stock <= 5 ? "color:var(--accent-light); font-weight:700;" : ""}">${p.stock}${p.stock === 0 ? " · out" : p.stock <= 5 ? " · low" : ""}</td>
      <td>
        <button class="icon-action" data-edit="${p.id}" title="Edit">✏️</button>
        <button class="icon-action" data-delete="${p.id}" title="Delete">🗑️</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8" class="muted" style="text-align:center; padding:30px;">No products yet.</td></tr>`;

  document.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEditProduct(btn.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteProduct(btn.dataset.delete)));
  return products;
}

function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(val){
  const s = val == null ? "" : String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Exports the same fields the chat/voice assistant's search_catalog tool sees
// (id, name, category, price, rating, tagline, description, keywords), so the
// file doubles as a reference for prompt engineering or a fine-tuning dataset.
const PRODUCT_EXPORT_FIELDS = ["id", "name", "category", "department", "price", "oldPrice", "rating", "badge", "tagline", "description", "keywords"];

async function exportProductsCSV(){
  try {
    const products = await Api.getProducts();
    const rows = [PRODUCT_EXPORT_FIELDS.join(",")];
    products.forEach(p => {
      rows.push(PRODUCT_EXPORT_FIELDS.map(f => {
        if (f === "keywords") return csvEscape((p.keywords || []).join("; "));
        return csvEscape(p[f]);
      }).join(","));
    });
    downloadFile(`voltaimart-products-${Date.now()}.csv`, rows.join("\n"), "text/csv");
    showToast(`Exported ${products.length} products as CSV.`);
  } catch (err){
    showToast(err.message || "Couldn't export products.");
  }
}

async function exportProductsJSON(){
  try {
    const products = await Api.getProducts();
    const slim = products.map(p => {
      const out = {};
      PRODUCT_EXPORT_FIELDS.forEach(f => { out[f] = p[f]; });
      out.keywords = p.keywords || [];
      return out;
    });
    downloadFile(`voltaimart-products-${Date.now()}.json`, JSON.stringify(slim, null, 2), "application/json");
    showToast(`Exported ${products.length} products as JSON.`);
  } catch (err){
    showToast(err.message || "Couldn't export products.");
  }
}

function categoryLabelSafe(id){
  const c = META.categories.find(c => c.id === id);
  return c ? c.label : id;
}

function populateCategorySelect(){
  const sel = document.getElementById("pfCategory");
  sel.innerHTML = META.categories.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join("");
}

function openAddProduct(){
  editingProductId = null;
  document.getElementById("productModalTitle").textContent = "Add product";
  document.getElementById("productFormSubmit").textContent = "Save product";
  document.getElementById("productForm").reset();
  document.getElementById("pfIcon").value = "📦";
  document.getElementById("pfRating").value = "4.5";
  document.getElementById("pfStock").value = "25";
  document.getElementById("productFormError").textContent = "";
  document.getElementById("productModalOverlay").classList.add("open");
}

async function openEditProduct(id){
  const product = await Api.getProduct(id);
  editingProductId = id;
  document.getElementById("productModalTitle").textContent = "Edit product";
  document.getElementById("productFormSubmit").textContent = "Update product";
  document.getElementById("productFormError").textContent = "";
  document.getElementById("pfName").value = product.name;
  document.getElementById("pfCategory").value = product.category;
  document.getElementById("pfPrice").value = product.price;
  document.getElementById("pfOldPrice").value = product.oldPrice || "";
  document.getElementById("pfRating").value = product.rating;
  document.getElementById("pfIcon").value = product.icon;
  document.getElementById("pfStock").value = product.stock != null ? product.stock : 25;
  document.getElementById("pfBadge").value = product.badge || "";
  document.getElementById("pfTagline").value = product.tagline || "";
  document.getElementById("pfDescription").value = product.description || "";
  document.getElementById("pfKeywords").value = (product.keywords || []).join(", ");
  document.getElementById("productModalOverlay").classList.add("open");
}

function closeProductModal(){
  document.getElementById("productModalOverlay").classList.remove("open");
}

async function deleteProduct(id){
  if (!confirm("Delete this product? This can't be undone.")) return;
  try {
    await Api.deleteProduct(id);
    showToast("Product deleted.");
    loadProducts();
    refreshOverviewStats();
  } catch(err){
    showToast(err.message || "Couldn't delete product.");
  }
}

/* ---------------- Users (admin only) ---------------- */
async function loadUsers(){
  if (currentUser.role !== "admin") return [];
  const users = await Api.getUsers();
  document.getElementById("userCount").textContent = `${users.length} user${users.length === 1 ? "" : "s"}`;
  document.getElementById("usersBody").innerHTML = users.map(u => `
    <tr>
      <td>${u.name}</td>
      <td class="muted">${u.email}</td>
      <td>
        <select class="status-select role-select" data-user-id="${u.id}" ${u.id === currentUser.id ? "disabled title='You can\\'t change your own role'" : ""}>
          ${["admin","agent","customer"].map(r => `<option value="${r}" ${u.role===r?"selected":""}>${r}</option>`).join("")}
        </select>
      </td>
      <td class="muted" style="font-size:12.5px;">${fmtDate(u.createdAt)}</td>
      <td>
        ${u.id === currentUser.id ? "" : `<button class="icon-action" data-delete-user="${u.id}" data-user-name="${u.name}" title="Delete user">🗑️</button>`}
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".role-select").forEach(sel => {
    sel.addEventListener("change", async (e) => {
      try {
        await Api.updateUserRole(e.target.dataset.userId, e.target.value);
        showToast("User role updated.");
      } catch(err){
        showToast(err.message || "Couldn't update role.");
        loadUsers();
      }
    });
  });

  document.querySelectorAll("[data-delete-user]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Delete user "${btn.dataset.userName}"? Their orders are kept for record-keeping.`)) return;
      try {
        await Api.deleteUser(btn.dataset.deleteUser);
        showToast("User deleted.");
        loadUsers();
        refreshOverviewStats();
      } catch(err){
        showToast(err.message || "Couldn't delete that user.");
      }
    });
  });
  return users;
}

/* ---------------- AI Settings (admin only) ---------------- */
const PROVIDER_META = {
  anthropic: {
    name: "Claude", fullName: "Anthropic Claude", icon: "🔶",
    blurb: "Strong reasoning and long context, excellent at following instructions and using tools.",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  gemini: {
    name: "Gemini", fullName: "Google Gemini", icon: "✨",
    blurb: "Generous free tier with a very long context window — a good default to try first.",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  openai: {
    name: "GPT", fullName: "OpenAI GPT", icon: "🟢",
    blurb: "Broad tool/function-calling support and wide ecosystem compatibility.",
    keyUrl: "https://platform.openai.com/api-keys",
  },
};
const COMING_SOON_PROVIDERS = [
  { name: "HF", icon: "🤗" },
  { name: "Mistral", icon: "🌬️" },
  { name: "Groq", icon: "⚡" },
];
const MODEL_CATALOG = {
  anthropic: [
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", badge: "Recommended" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", badge: "Best" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", badge: "Fast" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini", badge: "Recommended" },
    { id: "gpt-4o", label: "GPT-4o", badge: "Best" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", badge: "Fast" },
  ],
  gemini: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", badge: "Recommended" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", badge: "Best" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", badge: "Fast" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", badge: "" },
  ],
};

let currentAiSettings = null;
let modalSelectedProvider = null;
let modalSelectedModel = null;

function renderProviderSummary(settings){
  const p = settings.llmProvider;
  const meta = PROVIDER_META[p];
  document.getElementById("providerSummaryIcon").textContent = meta.icon;
  document.getElementById("providerSummaryName").textContent = meta.name;
  document.getElementById("providerSummaryModel").textContent = settings.models[p];
  const badge = document.getElementById("providerSummaryKeyStatus");
  badge.textContent = settings.hasKey[p] ? "Saved" : "Not set";
  badge.classList.toggle("saved", settings.hasKey[p]);
}

async function loadSettings(){
  try {
    const settings = await Api.getSettings();
    currentAiSettings = settings;
    renderProviderSummary(settings);
    document.getElementById("settingsSearchKey").placeholder = settings.webSearch.hasKey ? settings.webSearch.apiKey : "tvly-...";
    document.getElementById("settingsSearchStatus").textContent = settings.webSearch.hasKey
      ? "A search key is saved — live web search is active."
      : "No search key saved yet — the assistant will only use the live product catalog.";
  } catch (err){
    showToast(err.message || "Couldn't load AI settings.");
  }
}

// Saves just the Tavily search key — the chat provider itself is configured
// through the "Configure AI Provider" modal below.
async function saveSettings(){
  const errorEl = document.getElementById("settingsError");
  errorEl.textContent = "";
  const saveBtn = document.getElementById("settingsSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const searchKeyEl = document.getElementById("settingsSearchKey");
  const payload = { webSearch: { provider: "tavily", apiKey: searchKeyEl.value.trim() || undefined } };

  try {
    await Api.updateSettings(payload);
    showToast("AI settings saved.");
    searchKeyEl.value = "";
    await loadSettings();
  } catch (err){
    errorEl.textContent = err.message || "Couldn't save AI settings.";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save AI settings";
  }
}

async function forgetSearchKey(){
  if (!confirm("Forget the saved Tavily search key?")) return;
  try {
    await Api.updateSettings({ webSearch: { forget: true } });
    showToast("Search key removed.");
    await loadSettings();
  } catch (err){
    showToast(err.message || "Couldn't remove search key.");
  }
}

/* ---- AI Provider Settings modal ---- */
function renderProviderGrid(){
  const container = document.getElementById("providerGrid");
  const real = Object.keys(PROVIDER_META).map(id => {
    const meta = PROVIDER_META[id];
    const selected = modalSelectedProvider === id;
    const saved = currentAiSettings && currentAiSettings.hasKey[id];
    return `
      <div class="provider-card ${selected ? "selected" : ""}" data-provider-card="${id}">
        <div class="provider-card-radio"></div>
        <div class="provider-card-icon">${meta.icon}</div>
        <div class="provider-card-name">${meta.name}</div>
        <div class="provider-card-badges">
          <span class="provider-card-badge ${saved ? "" : "muted-badge"}">${saved ? "Key saved" : "Not set"}</span>
        </div>
      </div>
    `;
  }).join("");
  const comingSoon = COMING_SOON_PROVIDERS.map(p => `
    <div class="provider-card disabled" title="Coming soon">
      <div class="provider-card-icon">${p.icon}</div>
      <div class="provider-card-name">${p.name}</div>
      <div class="provider-card-badges"><span class="provider-card-badge muted-badge">Coming soon</span></div>
    </div>
  `).join("");
  container.innerHTML = real + comingSoon;
  container.querySelectorAll("[data-provider-card]").forEach(card => {
    card.addEventListener("click", () => selectModalProvider(card.dataset.providerCard));
  });
}

function renderProviderInfoPanel(){
  const meta = PROVIDER_META[modalSelectedProvider];
  let hostname = meta.keyUrl;
  try { hostname = new URL(meta.keyUrl).hostname; } catch (e){ /* ignore */ }
  document.getElementById("providerInfoPanel").innerHTML = `
    <strong>${meta.icon} ${meta.fullName}</strong>
    ${meta.blurb}
    <div style="margin-top:8px;"><a href="${meta.keyUrl}" target="_blank" rel="noopener">Get an API key at ${hostname} ↗</a></div>
  `;
}

function renderModelList(){
  const models = MODEL_CATALOG[modalSelectedProvider] || [];
  const container = document.getElementById("modelList");
  container.innerHTML = models.map(m => `
    <div class="model-row ${modalSelectedModel === m.id ? "selected" : ""}" data-model-row="${m.id}">
      <div class="model-row-radio"></div>
      <div class="model-row-label">${m.label}</div>
      ${m.badge ? `<span class="model-row-badge">${m.badge}</span>` : ""}
    </div>
  `).join("");
  container.querySelectorAll("[data-model-row]").forEach(row => {
    row.addEventListener("click", () => {
      modalSelectedModel = row.dataset.modelRow;
      renderModelList();
    });
  });
}

function renderKeySection(){
  const hasKey = currentAiSettings && currentAiSettings.hasKey[modalSelectedProvider];
  const maskedKey = currentAiSettings && currentAiSettings.apiKeys[modalSelectedProvider];

  const statusEl = document.getElementById("keySectionStatus");
  statusEl.textContent = hasKey ? "Saved" : "Not set";
  statusEl.classList.toggle("saved", !!hasKey);

  const input = document.getElementById("providerKeyInput");
  input.value = "";
  input.placeholder = hasKey ? maskedKey : "Paste API key…";

  document.getElementById("providerKeyGetLink").href = PROVIDER_META[modalSelectedProvider].keyUrl;
}

function selectModalProvider(id){
  modalSelectedProvider = id;
  const models = MODEL_CATALOG[id] || [];
  const savedModel = currentAiSettings && currentAiSettings.models[id];
  modalSelectedModel = models.some(m => m.id === savedModel) ? savedModel : (models[0] && models[0].id);
  renderProviderGrid();
  renderProviderInfoPanel();
  renderModelList();
  renderKeySection();
}

function openAiProviderModal(){
  if (!currentAiSettings){
    showToast("Still loading settings — try again in a second.");
    return;
  }
  document.getElementById("aiProviderModalError").textContent = "";
  selectModalProvider(currentAiSettings.llmProvider);
  document.getElementById("aiProviderModalOverlay").classList.add("open");
}

function closeAiProviderModal(){
  document.getElementById("aiProviderModalOverlay").classList.remove("open");
}

async function useSelectedProvider(){
  const errorEl = document.getElementById("aiProviderModalError");
  errorEl.textContent = "";
  const btn = document.getElementById("useProviderBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const typedKey = document.getElementById("providerKeyInput").value.trim();
  const payload = {
    llmProvider: modalSelectedProvider,
    models: { [modalSelectedProvider]: modalSelectedModel },
  };
  if (typedKey) payload.apiKeys = { [modalSelectedProvider]: typedKey };

  try {
    await Api.updateSettings(payload);
    showToast(`Now using ${PROVIDER_META[modalSelectedProvider].name}.`);
    await loadSettings();
    closeAiProviderModal();
  } catch (err){
    errorEl.textContent = err.message || "Couldn't save provider settings.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Use this provider";
  }
}

async function forgetProviderKey(){
  if (!confirm(`Forget the saved ${PROVIDER_META[modalSelectedProvider].name} API key?`)) return;
  try {
    await Api.updateSettings({ forgetKeys: [modalSelectedProvider] });
    showToast("API key removed.");
    await loadSettings();
    renderKeySection();
    renderProviderGrid();
  } catch (err){
    showToast(err.message || "Couldn't remove API key.");
  }
}

/* ---------------- Voice AI agent settings (Vapi, admin only) ----------------
   Fully separate from loadSettings()/saveSettings() above (the VoltAI
   Assistant chat provider) — this only manages the homepage hero-search
   voice agent and doesn't touch that flow. */
function toggleVapiModeBlocks(){
  const mode = document.getElementById("vapiMode").value;
  document.getElementById("vapiAssistantIdBlock").style.display = mode === "assistantId" ? "" : "none";
  document.getElementById("vapiInlineBlock").style.display = mode === "inline" ? "" : "none";
}

function toggleVapiAgentModeBlocks(){
  const agentMode = document.getElementById("vapiAgentMode").value;
  document.getElementById("vapiLiveFieldsBlock").style.display = agentMode === "vapi" ? "" : "none";
  document.getElementById("agentModeHint").textContent = agentMode === "vapi"
    ? "Runs a live voice conversation through Vapi. Falls back to the free simulated agent automatically if the key is missing or invalid."
    : "Uses your browser's built-in speech recognition to match spoken requests against a fixed set of shortcuts (open cart, browse a department/category, search the catalog) — no API key, no cost.";
}

async function loadVapiSettings(){
  try {
    const settings = await Api.getSettings();
    const vapi = settings.vapi;
    document.getElementById("vapiAgentMode").value = vapi.agentMode;
    document.getElementById("vapiMode").value = vapi.mode;
    document.getElementById("vapiPublicKey").placeholder = vapi.hasPublicKey ? vapi.publicKey : "Paste public key…";
    document.getElementById("vapiAssistantId").value = vapi.assistantId || "";
    document.getElementById("vapiFirstMessage").value = vapi.inline.firstMessage || "";
    document.getElementById("vapiSystemPrompt").value = vapi.inline.systemPrompt || "";
    document.getElementById("vapiModelProvider").value = vapi.inline.modelProvider || "";
    document.getElementById("vapiModelName").value = vapi.inline.modelName || "";
    document.getElementById("vapiVoiceProvider").value = vapi.inline.voiceProvider || "";
    document.getElementById("vapiVoiceId").value = vapi.inline.voiceId || "";
    document.getElementById("vapiStatus").textContent = vapi.agentMode === "vapi"
      ? (vapi.hasPublicKey ? "A public key is saved — the hero search mic runs the live Vapi agent." : "No public key saved yet — the hero mic will run the free simulated agent instead until one is added.")
      : "Running the free simulated voice agent — no API key needed.";
    toggleVapiModeBlocks();
    toggleVapiAgentModeBlocks();
  } catch (err){
    showToast(err.message || "Couldn't load voice agent settings.");
  }
}

async function saveVapiSettings(){
  const errorEl = document.getElementById("vapiError");
  errorEl.textContent = "";
  const saveBtn = document.getElementById("vapiSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const publicKeyEl = document.getElementById("vapiPublicKey");
  const payload = {
    vapi: {
      agentMode: document.getElementById("vapiAgentMode").value,
      mode: document.getElementById("vapiMode").value,
      publicKey: publicKeyEl.value.trim() || undefined,
      assistantId: document.getElementById("vapiAssistantId").value.trim(),
      inline: {
        firstMessage: document.getElementById("vapiFirstMessage").value.trim(),
        systemPrompt: document.getElementById("vapiSystemPrompt").value.trim(),
        modelProvider: document.getElementById("vapiModelProvider").value.trim(),
        modelName: document.getElementById("vapiModelName").value.trim(),
        voiceProvider: document.getElementById("vapiVoiceProvider").value.trim(),
        voiceId: document.getElementById("vapiVoiceId").value.trim(),
      },
    },
  };

  try {
    await Api.updateSettings(payload);
    showToast("Voice agent settings saved.");
    publicKeyEl.value = "";
    await loadVapiSettings();
  } catch (err){
    errorEl.textContent = err.message || "Couldn't save voice agent settings.";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save voice agent settings";
  }
}

/* ---------------- Tabs ---------------- */
function switchTab(tab){
  document.querySelectorAll(".dash-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("panel-orders").style.display = tab === "orders" ? "" : "none";
  document.getElementById("panel-products").style.display = tab === "products" ? "" : "none";
  document.getElementById("panel-users").style.display = tab === "users" ? "" : "none";
  document.getElementById("panel-settings").style.display = tab === "settings" ? "" : "none";
  document.getElementById("panel-stack").style.display = tab === "stack" ? "" : "none";
}

async function refreshOverviewStats(){
  const [orders, products, users] = await Promise.all([
    Api.getOrders(),
    Api.getProducts(),
    currentUser.role === "admin" ? Api.getUsers() : Promise.resolve([]),
  ]);
  renderStats(orders, products, users);
}

/* ---------------- Init ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  currentUser = requireRole(["admin", "agent"]);
  if (!currentUser) return;

  renderUserBadge();
  document.getElementById("roleEyebrow").textContent = currentUser.role === "admin" ? "Admin back office" : "Agent back office";
  document.getElementById("dashTitle").textContent = `Welcome back, ${currentUser.name.split(" ")[0]}`;

  if (currentUser.role === "admin"){
    document.getElementById("usersTabBtn").style.display = "";
    document.getElementById("settingsTabBtn").style.display = "";
    document.getElementById("stackTabBtn").style.display = "";
  }

  META = await Api.getMeta();
  populateCategorySelect();

  document.querySelectorAll(".dash-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === "users") await loadUsers();
      if (btn.dataset.tab === "settings"){
        await loadSettings();
        await loadVapiSettings();
      }
    });
  });

  if (currentUser.role === "admin"){
    document.getElementById("settingsSaveBtn").addEventListener("click", saveSettings);
    document.getElementById("settingsSearchForgetBtn").addEventListener("click", forgetSearchKey);

    document.getElementById("openAiProviderModalBtn").addEventListener("click", openAiProviderModal);
    document.getElementById("aiProviderModalClose").addEventListener("click", closeAiProviderModal);
    document.getElementById("aiProviderModalCancel").addEventListener("click", closeAiProviderModal);
    document.getElementById("aiProviderModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "aiProviderModalOverlay") closeAiProviderModal();
    });
    document.getElementById("useProviderBtn").addEventListener("click", useSelectedProvider);
    document.getElementById("providerKeyForgetBtn").addEventListener("click", forgetProviderKey);

    document.getElementById("vapiSaveBtn").addEventListener("click", saveVapiSettings);
    document.getElementById("vapiMode").addEventListener("change", toggleVapiModeBlocks);
    document.getElementById("vapiAgentMode").addEventListener("change", toggleVapiAgentModeBlocks);
  }

  document.getElementById("orderStatusFilter").addEventListener("change", loadOrders);
  document.getElementById("addProductBtn").addEventListener("click", openAddProduct);
  document.getElementById("exportProductsCsvBtn").addEventListener("click", exportProductsCSV);
  document.getElementById("exportProductsJsonBtn").addEventListener("click", exportProductsJSON);
  document.getElementById("productModalClose").addEventListener("click", closeProductModal);
  document.getElementById("productFormCancel").addEventListener("click", closeProductModal);
  document.getElementById("productModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "productModalOverlay") closeProductModal();
  });

  document.getElementById("productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("productFormError");
    errorEl.textContent = "";
    const payload = {
      name: document.getElementById("pfName").value.trim(),
      category: document.getElementById("pfCategory").value,
      price: parseFloat(document.getElementById("pfPrice").value),
      oldPrice: document.getElementById("pfOldPrice").value ? parseFloat(document.getElementById("pfOldPrice").value) : undefined,
      rating: parseFloat(document.getElementById("pfRating").value) || 4.5,
      icon: document.getElementById("pfIcon").value.trim() || "📦",
      stock: parseInt(document.getElementById("pfStock").value, 10) || 0,
      badge: document.getElementById("pfBadge").value || undefined,
      tagline: document.getElementById("pfTagline").value.trim(),
      description: document.getElementById("pfDescription").value.trim(),
      keywords: document.getElementById("pfKeywords").value.split(",").map(k => k.trim().toLowerCase()).filter(Boolean),
    };
    const submitBtn = document.getElementById("productFormSubmit");
    submitBtn.disabled = true;
    try {
      if (editingProductId){
        await Api.updateProduct(editingProductId, payload);
        showToast("Product updated.");
      } else {
        await Api.createProduct(payload);
        showToast("Product added to the catalog.");
      }
      closeProductModal();
      loadProducts();
      refreshOverviewStats();
    } catch(err){
      errorEl.textContent = err.message || "Couldn't save product.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  const [orders, products] = await Promise.all([loadOrders(), loadProducts()]);
  const users = currentUser.role === "admin" ? await loadUsers() : [];
  renderStats(orders, products, users);
});
