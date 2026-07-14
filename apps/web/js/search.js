/* ============================================================
   VoltAIMart — smart autocomplete dropdown.
   Attaches to every .nav-search / .hero-search input WITHOUT touching
   the existing voice-search wiring (aichat.js, voiceAgent.js,
   vapiCall.js, phoneSimulator.js) or the existing Enter-to-search
   handler in app.js (goToSearch) — this only adds a suggestions layer
   on top, plus lightweight, best-effort analytics events.
   ============================================================ */

const SEARCH_SESSION_KEY = "voltaimart_search_session";

/** Starts (or restarts) a search "session" used to attribute later clicks/
    add-to-cart/purchases back to the search that led to them. */
function startNewSearchSession(){
  const id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  sessionStorage.setItem(SEARCH_SESSION_KEY, id);
  return id;
}
function getSearchSessionId(){
  return sessionStorage.getItem(SEARCH_SESSION_KEY) || "";
}

function debounce(fn, ms){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function suggestRowHTML(type, opts){
  if (type === "product"){
    const p = opts;
    return `
      <a class="suggest-row suggest-row-product" data-type="product" data-id="${p.id}" href="product.html?id=${p.id}">
        <span class="suggest-thumb">${p.icon || "📦"}</span>
        <span class="suggest-product-info">
          <span class="suggest-product-name"></span>
          <span class="suggest-product-meta"></span>
        </span>
        <span class="suggest-product-price">₹${p.price.toLocaleString("en-IN")}</span>
      </a>`;
  }
  if (type === "category"){
    return `<div class="suggest-row" data-type="category" data-value="${opts.id}"><span class="suggest-icon">${opts.icon || "📂"}</span><span class="suggest-label"></span></div>`;
  }
  if (type === "brand"){
    return `<div class="suggest-row" data-type="brand" data-value="${opts.name}"><span class="suggest-icon">🏷️</span><span class="suggest-label"></span></div>`;
  }
  // popular / trending / recent — plain query text
  const icon = opts.kind === "trending" ? "📈" : opts.kind === "recent" ? "🕐" : "🔥";
  return `<div class="suggest-row" data-type="query" data-value="${opts.text}"><span class="suggest-icon">${icon}</span><span class="suggest-label"></span></div>`;
}

function fillTextContent(row, type, opts){
  // Untrusted labels (product names, saved recent-search text, etc.) go in via
  // textContent — never string-concatenated into innerHTML.
  if (type === "product"){
    row.querySelector(".suggest-product-name").textContent = opts.name;
    row.querySelector(".suggest-product-meta").textContent = `${opts.category || ""}${opts.brand ? " · " + opts.brand : ""}`;
  } else if (type === "category"){
    row.querySelector(".suggest-label").textContent = opts.label;
  } else if (type === "brand"){
    row.querySelector(".suggest-label").textContent = opts.name;
  } else {
    row.querySelector(".suggest-label").textContent = opts.text;
  }
}

function buildSection(title, items, type, mapOpts){
  if (!items || !items.length) return "";
  const rows = items.map(item => {
    const opts = mapOpts(item);
    const html = suggestRowHTML(type, opts);
    return { html, opts };
  });
  const wrapper = document.createElement("div");
  wrapper.className = "suggest-section";
  wrapper.innerHTML = `<div class="suggest-section-title"></div>` + rows.map(r => r.html).join("");
  wrapper.querySelector(".suggest-section-title").textContent = title;
  const rowEls = wrapper.querySelectorAll(".suggest-row");
  rowEls.forEach((el, i) => fillTextContent(el, type, rows[i].opts));
  return wrapper;
}

function attachAutocomplete(input){
  const container = input.closest(".nav-search, .hero-search");
  if (!container || container.dataset.autocompleteAttached) return;
  container.dataset.autocompleteAttached = "1";
  container.style.position = container.style.position || "relative";

  const panel = document.createElement("div");
  panel.className = "search-suggest-panel";
  panel.setAttribute("role", "listbox");
  container.appendChild(panel);

  let activeIndex = -1;
  let rowEls = [];

  function closePanel(){
    panel.classList.remove("open");
    panel.innerHTML = "";
    rowEls = [];
    activeIndex = -1;
  }

  function highlight(i){
    rowEls.forEach(el => el.classList.remove("active"));
    activeIndex = i;
    if (i >= 0 && i < rowEls.length){
      rowEls[i].classList.add("active");
      rowEls[i].scrollIntoView({ block: "nearest" });
    }
  }

  function selectRow(el){
    const type = el.dataset.type;
    if (type === "product"){
      Api.trackSearchEvent({ type: "suggest_click", productId: el.dataset.id, query: input.value.trim(), searchSessionId: getSearchSessionId() || startNewSearchSession() });
      return; // let the anchor's href navigate normally
    }
    startNewSearchSession();
    if (type === "category") window.location.href = `products.html?category=${encodeURIComponent(el.dataset.value)}`;
    else if (type === "brand") window.location.href = `products.html?brand=${encodeURIComponent(el.dataset.value)}`;
    else window.location.href = `products.html?q=${encodeURIComponent(el.dataset.value)}`;
  }

  async function renderSuggestions(q){
    if (q.length < 2){ closePanel(); return; }
    let data;
    try { data = await Api.suggest(q); }
    catch(e){ return; }
    // Query may have changed while the request was in flight.
    if (input.value.trim() !== q) return;

    panel.innerHTML = "";
    const sections = [
      buildSection("Recent searches", data.recentSearches, "query", t => ({ text: t, kind: "recent" })),
      buildSection("Products", data.products, "product", p => p),
      buildSection("Categories", data.categories, "category", c => c),
      buildSection("Brands", data.brands, "brand", b => b),
      buildSection("Trending searches", data.trendingSearches, "query", t => ({ text: t, kind: "trending" })),
      buildSection("Popular searches", data.popularSearches, "query", t => ({ text: t, kind: "popular" })),
    ].filter(Boolean);

    if (!sections.length){ closePanel(); return; }
    sections.forEach(s => panel.appendChild(s));
    panel.classList.add("open");
    rowEls = Array.from(panel.querySelectorAll(".suggest-row"));
    activeIndex = -1;

    rowEls.forEach(el => {
      el.addEventListener("mousedown", (e) => {
        // mousedown (not click) fires before the input's blur closes the panel.
        if (el.tagName === "A") return; // let the anchor navigate + our click tracker below run
        e.preventDefault();
        selectRow(el);
      });
      if (el.tagName === "A"){
        el.addEventListener("click", () => selectRow(el));
      }
    });
  }

  const debouncedRender = debounce(() => renderSuggestions(input.value.trim()), 250);
  input.addEventListener("input", debouncedRender);
  input.addEventListener("focus", () => { if (input.value.trim().length >= 2) renderSuggestions(input.value.trim()); });

  input.addEventListener("keydown", (e) => {
    if (!panel.classList.contains("open")) return;
    if (e.key === "ArrowDown"){
      e.preventDefault();
      highlight(Math.min(activeIndex + 1, rowEls.length - 1));
    } else if (e.key === "ArrowUp"){
      e.preventDefault();
      highlight(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Escape"){
      closePanel();
    } else if (e.key === "Enter" && activeIndex >= 0 && rowEls[activeIndex]){
      // A row is highlighted — select it instead of falling through to the
      // plain-text submit handler already wired in app.js.
      e.preventDefault();
      e.stopImmediatePropagation();
      const el = rowEls[activeIndex];
      if (el.tagName === "A") el.click();
      else selectRow(el);
    }
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) closePanel();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-search input, .hero-search input").forEach(attachAutocomplete);
});
// The drawer/search bar can be injected after catalog load on some pages.
document.addEventListener("catalog:ready", () => {
  document.querySelectorAll(".nav-search input, .hero-search input").forEach(attachAutocomplete);
});
