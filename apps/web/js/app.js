/* ============================================================
   VoltAIMart — shared app logic: cart (localStorage), rendering
   helpers, nav wiring, toast notifications.
   ============================================================ */

const CART_KEY = "voltaimart_cart_v1";

function getCart(){
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch(e){ return {}; }
}
function saveCart(cart){
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}
function addToCart(productId, qty = 1){
  const cart = getCart();
  cart[productId] = (cart[productId] || 0) + qty;
  saveCart(cart);
  const p = getProductById(productId);
  showToast(`Added "${p ? p.name : "item"}" to cart`);
  // Best-effort search-analytics attribution (js/search.js) — a no-op off any
  // page that isn't part of a live search session.
  if (typeof getSearchSessionId === "function" && typeof Api !== "undefined"){
    const sessionId = getSearchSessionId();
    if (sessionId) Api.trackSearchEvent({ type: "add_to_cart", productId, searchSessionId: sessionId });
  }
}
function setCartQty(productId, qty){
  const cart = getCart();
  if (qty <= 0) delete cart[productId];
  else cart[productId] = qty;
  saveCart(cart);
}
function removeFromCart(productId){
  const cart = getCart();
  delete cart[productId];
  saveCart(cart);
}
function cartCount(){
  const cart = getCart();
  return Object.values(cart).reduce((a,b) => a+b, 0);
}
function cartTotal(){
  const cart = getCart();
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = getProductById(id);
    return sum + (p ? p.price * qty : 0);
  }, 0);
}
function updateCartBadge(){
  document.querySelectorAll("[data-cart-badge]").forEach(el => {
    const n = cartCount();
    el.textContent = n;
    el.style.display = n > 0 ? "flex" : "none";
  });
}

function starString(rating){
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

/* ---------------- Wishlist (server-persisted per logged-in user) ---------------- */
let WISHLIST_IDS = new Set();

async function refreshWishlistState(){
  if (!isLoggedIn()){ WISHLIST_IDS = new Set(); return; }
  try {
    const ids = await Api.getWishlist();
    WISHLIST_IDS = new Set(ids);
    paintWishlistButtons();
  } catch(e){ /* best-effort — leave WISHLIST_IDS as-is */ }
}
function paintWishlistButtons(){
  document.querySelectorAll("[data-wishlist]").forEach(btn => {
    const active = WISHLIST_IDS.has(btn.dataset.wishlist);
    btn.classList.toggle("active", active);
    btn.textContent = active ? "♥" : "♡";
  });
}
async function toggleWishlist(productId){
  if (!isLoggedIn()){
    showToast("Please log in to save items.");
    setTimeout(() => { window.location.href = `login.html?redirect=${encodeURIComponent(location.pathname + location.search)}`; }, 900);
    return;
  }
  const wasSaved = WISHLIST_IDS.has(productId);
  if (wasSaved) WISHLIST_IDS.delete(productId); else WISHLIST_IDS.add(productId);
  paintWishlistButtons();
  try {
    if (wasSaved) await Api.removeFromWishlist(productId);
    else await Api.addToWishlist(productId);
  } catch(err){
    if (wasSaved) WISHLIST_IDS.add(productId); else WISHLIST_IDS.delete(productId);
    paintWishlistButtons();
    showToast(err.message || "Couldn't update wishlist.");
  }
}

function productCardHTML(p){
  return `
  <div class="product-card">
    <div class="product-thumb-wrap">
      <a href="product.html?id=${p.id}">
        <div class="product-thumb">
          ${p.badge ? `<span class="tag ${p.badge === 'NEW' ? 'new' : ''}">${p.badge}</span>` : ""}
          <span>${p.icon}</span>
        </div>
      </a>
      <button class="wishlist-btn ${WISHLIST_IDS.has(p.id) ? 'active' : ''}" data-wishlist="${p.id}" type="button" onclick="toggleWishlist('${p.id}')" title="Save to wishlist">${WISHLIST_IDS.has(p.id) ? "♥" : "♡"}</button>
    </div>
    <div class="product-body">
      <span class="product-cat">${categoryLabel(p.category)}</span>
      <a href="product.html?id=${p.id}"><span class="product-name">${p.name}</span></a>
      <span class="stars">${starString(p.rating)} <span class="muted">(${p.rating}${p.reviewCount ? ` · ${p.reviewCount} review${p.reviewCount === 1 ? "" : "s"}` : ""})</span></span>
      <div class="price-row">
        <span class="price">₹${p.price.toLocaleString('en-IN')}</span>
        ${p.oldPrice ? `<span class="price-old">₹${p.oldPrice.toLocaleString('en-IN')}</span>` : ""}
      </div>
      ${p.stock === 0
        ? `<button class="btn btn-ghost btn-block" disabled>Out of stock</button>`
        : `<button class="btn btn-primary btn-block" onclick="addToCart('${p.id}')">Add to cart</button>`}
    </div>
  </div>`;
}

function categoryLabel(catId){
  const c = CATEGORIES.find(c => c.id === catId);
  return c ? c.label : catId;
}

function renderGrid(containerSelector, products){
  const el = document.querySelector(containerSelector);
  if (!el) return;
  if (!products.length){
    el.innerHTML = `<div class="empty-state"><span class="icon">🔍</span><p>No products found. Try another search.</p></div>`;
    return;
  }
  el.innerHTML = products.map(productCardHTML).join("");
}

function highlightActiveNav(){
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a[data-page]").forEach(a => {
    if (a.dataset.page === path) a.classList.add("active");
  });
}

function goToSearch(query){
  // Stamps a fresh search-attribution session (js/search.js) before leaving —
  // later clicks/add-to-cart/purchase on products.html attribute back to it.
  if (typeof startNewSearchSession === "function") startNewSearchSession();
  window.location.href = `products.html?q=${encodeURIComponent(query)}`;
}

/* ---------------- Slide-out menu (hamburger drawer) ---------------- */
function injectDrawer(){
  if (document.getElementById("drawer")) return;

  const backdrop = document.createElement("div");
  backdrop.className = "drawer-backdrop";
  backdrop.id = "drawerBackdrop";
  document.body.appendChild(backdrop);

  const deptBlocks = DEPARTMENTS.map(dept => {
    const cats = getCategoriesByDepartment(dept.id);
    return `
      <div class="drawer-dept">
        <a class="drawer-dept-head" href="products.html?department=${dept.id}">
          <span>${dept.icon} ${dept.label}</span>
          <span class="drawer-dept-arrow">→</span>
        </a>
        <div class="drawer-sublinks">
          ${cats.map(c => `<a href="products.html?category=${c.id}">${c.icon} ${c.label}</a>`).join("")}
        </div>
      </div>
    `;
  }).join("");

  const drawer = document.createElement("aside");
  drawer.className = "drawer";
  drawer.id = "drawer";
  drawer.innerHTML = `
    <div class="drawer-head">
      <a href="index.html" class="logo"><span class="mark">⚡</span> VoltAIMart</a>
      <button class="voice-close" id="drawerClose" aria-label="Close menu">✕</button>
    </div>
    <nav class="drawer-nav">
      <a href="index.html" class="drawer-link">🏠 Home</a>
      ${deptBlocks}
    </nav>
    <div class="drawer-footer">
      <a href="cart.html">🛒 Cart</a>
      <a href="wishlist.html">🤍 Wishlist</a>
      <a href="track.html">📦 Track order</a>
      <a href="#">💬 Support</a>
    </div>
  `;
  document.body.appendChild(drawer);

  function openDrawer(){
    drawer.classList.add("open");
    backdrop.classList.add("open");
  }
  function closeDrawer(){
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
  }

  document.querySelectorAll("#menuToggle").forEach(btn => btn.addEventListener("click", openDrawer));
  backdrop.addEventListener("click", closeDrawer);
  document.getElementById("drawerClose").addEventListener("click", closeDrawer);
  drawer.querySelectorAll("a").forEach(a => a.addEventListener("click", closeDrawer));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
}

document.addEventListener("DOMContentLoaded", () => {
  updateCartBadge();
  highlightActiveNav();

  // wire up any nav-search inputs to submit on Enter
  document.querySelectorAll(".nav-search input, .hero-search input").forEach(input => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()){
        goToSearch(input.value.trim());
      }
    });
  });
});

// The drawer lists departments/categories, which come from the live catalog API.
document.addEventListener("catalog:ready", injectDrawer);
document.addEventListener("catalog:ready", refreshWishlistState);
