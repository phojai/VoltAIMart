/* ============================================================
   VoltAIMart — shared API client.
   Talks to the Express backend (server/server.js) over relative
   /api/* paths (same origin — the server also serves this
   static frontend, so no CORS/base-URL config is needed).
   ============================================================ */

const TOKEN_KEY = "voltaimart_token";
const USER_KEY = "voltaimart_user";

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function getStoredUser(){
  try { return JSON.parse(localStorage.getItem(USER_KEY)); }
  catch(e){ return null; }
}
function setSession(token, user){
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
function isLoggedIn(){ return !!getToken() && !!getStoredUser(); }

/** Low-level fetch wrapper: adds auth header, JSON body/parsing, and throws readable errors. */
async function apiFetch(pathname, options = {}){
  const headers = Object.assign({}, options.headers || {});
  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)){
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(pathname, { ...options, headers, body });
  let data = null;
  try { data = await res.json(); } catch(e){ data = null; }

  if (!res.ok){
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

const Api = {
  async login(email, password){
    const data = await apiFetch("/api/auth/login", { method: "POST", body: { email, password } });
    setSession(data.token, data.user);
    return data.user;
  },
  async register(name, email, password){
    const data = await apiFetch("/api/auth/register", { method: "POST", body: { name, email, password } });
    setSession(data.token, data.user);
    return data.user;
  },
  async me(){
    const data = await apiFetch("/api/auth/me");
    return data.user;
  },
  async updateProfile(patch){
    const data = await apiFetch("/api/auth/me", { method: "PATCH", body: patch });
    setSession(data.token, data.user);
    return data.user;
  },
  logout(){
    clearSession();
  },

  async getMeta(){
    return apiFetch("/api/meta");
  },
  async getProducts(query = {}){
    const qs = new URLSearchParams(Object.entries(query).filter(([,v]) => v));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const data = await apiFetch(`/api/products${suffix}`);
    return data.products;
  },
  async getProduct(id){
    const data = await apiFetch(`/api/products/${id}`);
    return data.product;
  },
  async createProduct(product){
    const data = await apiFetch("/api/products", { method: "POST", body: product });
    return data.product;
  },
  async updateProduct(id, patch){
    const data = await apiFetch(`/api/products/${id}`, { method: "PUT", body: patch });
    return data.product;
  },
  async deleteProduct(id){
    const data = await apiFetch(`/api/products/${id}`, { method: "DELETE" });
    return data.product;
  },

  async getOrders(){
    const data = await apiFetch("/api/orders");
    return data.orders;
  },
  async createOrder(items, shippingAddress, payment, extras = {}){
    const data = await apiFetch("/api/orders", { method: "POST", body: { items, shippingAddress, payment, ...extras } });
    return data.order;
  },
  async updateOrderStatus(id, status){
    const data = await apiFetch(`/api/orders/${id}`, { method: "PATCH", body: { status } });
    return data.order;
  },
  async cancelOrder(id){
    const data = await apiFetch(`/api/orders/${id}/cancel`, { method: "POST" });
    return data.order;
  },
  async trackOrder(id, email){
    const qs = new URLSearchParams({ id, email });
    const data = await apiFetch(`/api/orders/track?${qs}`);
    return data.order;
  },

  async getAddresses(){
    const data = await apiFetch("/api/addresses");
    return data.addresses;
  },
  async addAddress(address){
    const data = await apiFetch("/api/addresses", { method: "POST", body: address });
    return data.addresses;
  },
  async updateAddress(id, address){
    const data = await apiFetch(`/api/addresses/${id}`, { method: "PUT", body: address });
    return data.addresses;
  },
  async deleteAddress(id){
    const data = await apiFetch(`/api/addresses/${id}`, { method: "DELETE" });
    return data.addresses;
  },

  async getNotifications(){
    return apiFetch("/api/notifications");
  },
  async markNotificationsRead(){
    return apiFetch("/api/notifications/mark-read", { method: "POST" });
  },

  async getReviews(productId){
    const data = await apiFetch(`/api/products/${productId}/reviews`);
    return data.reviews;
  },
  async submitReview(productId, { rating, comment }){
    return apiFetch(`/api/products/${productId}/reviews`, { method: "POST", body: { rating, comment } });
  },

  async getWishlist(){
    const data = await apiFetch("/api/wishlist");
    return data.productIds;
  },
  async addToWishlist(productId){
    const data = await apiFetch(`/api/wishlist/${productId}`, { method: "POST" });
    return data.productIds;
  },
  async removeFromWishlist(productId){
    const data = await apiFetch(`/api/wishlist/${productId}`, { method: "DELETE" });
    return data.productIds;
  },

  async getUsers(){
    const data = await apiFetch("/api/users");
    return data.users;
  },
  async updateUserRole(id, role){
    const data = await apiFetch(`/api/users/${id}`, { method: "PATCH", body: { role } });
    return data.user;
  },
  async deleteUser(id){
    const data = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    return data.user;
  },

  async getSettings(){
    const data = await apiFetch("/api/settings");
    return data.settings;
  },
  async updateSettings(patch){
    const data = await apiFetch("/api/settings", { method: "PUT", body: patch });
    return data.settings;
  },
};

/** Redirects to login.html if not logged in, or if role isn't allowed. Returns the user, or null after redirecting. */
function requireRole(allowedRoles, opts = {}){
  const user = getStoredUser();
  if (!user){
    window.location.href = `login.html?redirect=${encodeURIComponent(location.pathname)}`;
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)){
    window.location.href = opts.fallback || "index.html";
    return null;
  }
  return user;
}

function roleLandingPage(role){
  if (role === "admin" || role === "agent") return "dashboard.html";
  return "account.html";
}

/** Updates the account icon in the header to reflect logged-in state; wires the logout button if present. */
function renderAuthNav(){
  const user = getStoredUser();
  document.querySelectorAll("[data-account-link]").forEach(el => {
    if (user){
      el.href = roleLandingPage(user.role);
      el.title = `${user.name} (${user.role})`;
      el.textContent = "";
      const initial = document.createElement("span");
      initial.className = "avatar-initial";
      initial.textContent = user.name.trim().charAt(0).toUpperCase();
      el.appendChild(initial);
    } else {
      el.href = "login.html";
      el.title = "Log in";
      el.textContent = "👤";
    }
  });
}

function showToast(message){
  let toast = document.querySelector(".toast");
  if (!toast){
    toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span class="dot"></span><span class="toast-msg"></span>`;
    document.body.appendChild(toast);
  }
  toast.querySelector(".toast-msg").textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 2600);
}

document.addEventListener("DOMContentLoaded", renderAuthNav);
