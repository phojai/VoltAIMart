/* ============================================================
   VoltAIMart — Admin / Agent back-office dashboard
   ============================================================ */

let currentUser = null;
let META = { departments: [], categories: [] };
let editingProductId = null;

function fmtMoney(n){ return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
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
      <td>${o.userName || o.userEmail}<div class="muted" style="font-size:12px;">${o.userEmail}</div></td>
      <td>${o.items.map(i => `${i.icon || ""} ${i.name} ×${i.qty}`).join("<br>")}</td>
      <td>${fmtMoney(o.total)}</td>
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
      <td>${p.name}${p.badge ? ` <span class="tag-inline ${p.badge==='NEW'?'new':''}">${p.badge}</span>` : ""}</td>
      <td class="muted">${categoryLabelSafe(p.category)}</td>
      <td>${fmtMoney(p.price)}${p.oldPrice ? `<div class="muted" style="font-size:12px; text-decoration:line-through;">${fmtMoney(p.oldPrice)}</div>` : ""}</td>
      <td>★ ${p.rating}</td>
      <td>
        <button class="icon-action" data-edit="${p.id}" title="Edit">✏️</button>
        <button class="icon-action" data-delete="${p.id}" title="Delete">🗑️</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="muted" style="text-align:center; padding:30px;">No products yet.</td></tr>`;

  document.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEditProduct(btn.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteProduct(btn.dataset.delete)));
  return products;
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
  return users;
}

/* ---------------- Tabs ---------------- */
function switchTab(tab){
  document.querySelectorAll(".dash-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("panel-orders").style.display = tab === "orders" ? "" : "none";
  document.getElementById("panel-products").style.display = tab === "products" ? "" : "none";
  document.getElementById("panel-users").style.display = tab === "users" ? "" : "none";
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
  }

  META = await Api.getMeta();
  populateCategorySelect();

  document.querySelectorAll(".dash-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === "users") await loadUsers();
    });
  });

  document.getElementById("orderStatusFilter").addEventListener("change", loadOrders);
  document.getElementById("addProductBtn").addEventListener("click", openAddProduct);
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
