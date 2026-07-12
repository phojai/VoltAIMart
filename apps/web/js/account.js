/* ============================================================
   VoltAIMart — Customer account page: profile, address book,
   notifications (simulated email inbox), and order history.
   ============================================================ */

function fmtMoney(n){ return `₹${Number(n).toLocaleString('en-IN')}`; }
function fmtDate(iso){ return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }

function orderTimelineHTML(status){
  if (status === "cancelled"){
    return `<div class="order-cancelled-banner">✕ This order was cancelled</div>`;
  }
  const steps = ["processing", "shipped", "delivered"];
  const labels = { processing: "Processing", shipped: "Shipped", delivered: "Delivered" };
  const idx = steps.indexOf(status);
  return `<div class="order-timeline">` + steps.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    const icon = i < idx ? "✓" : i === idx ? "●" : "";
    return `${i ? `<div class="timeline-line ${i <= idx ? "done" : ""}"></div>` : ""}<div class="timeline-step ${cls}"><span class="timeline-dot">${icon}</span> ${labels[s]}</div>`;
  }).join("") + `</div>`;
}

function renderOrderCard(order){
  const addr = order.shippingAddress;
  const pay = order.payment;
  return `
    <div class="card" style="margin-bottom:16px; padding:22px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:12px; flex-wrap:wrap;">
        <div>
          <div class="mono" style="font-size:13px;">${order.id}</div>
          <div class="muted" style="font-size:12.5px;">Placed ${fmtDate(order.createdAt)}</div>
        </div>
        <span class="status-select status-${order.status}" style="pointer-events:none;">${order.status}</span>
      </div>
      ${orderTimelineHTML(order.status)}
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
        ${order.items.map(i => `
          <div style="display:flex; justify-content:space-between; font-size:14px;">
            <span>${i.icon || ""} ${i.name} <span class="muted">×${i.qty}</span></span>
            <span>${fmtMoney(i.lineTotal)}</span>
          </div>
        `).join("")}
      </div>
      <div class="summary-row total" style="border-top:1px solid var(--divider); padding-top:12px; margin:0;">
        <span>Total</span><span>${fmtMoney(order.total)}</span>
      </div>
      ${addr ? `<p class="muted" style="font-size:12.5px; margin-top:10px;">📦 ${addr.line1}, ${addr.city} ${addr.pincode}${pay ? ` · 💳 ${pay.method === "upi" ? `UPI (${pay.vpa || ""})` : `Card ••••${pay.last4 || ""}`}` : ""}</p>` : ""}
      ${order.status === "processing" ? `<button class="btn btn-ghost btn-block" style="margin-top:12px; color:var(--danger);" data-cancel="${order.id}">Cancel order</button>` : ""}
    </div>
  `;
}

async function loadOrders(){
  try {
    const orders = await Api.getOrders();
    document.getElementById("orderCount").textContent = `${orders.length} order${orders.length === 1 ? "" : "s"}`;
    const list = document.getElementById("ordersList");
    if (!orders.length){
      list.innerHTML = `
        <div class="empty-state">
          <span class="icon">🛍️</span>
          <p>No orders yet. Your purchases will show up here.</p>
          <a href="products.html" class="btn btn-primary" style="margin-top:16px; display:inline-flex;">Start shopping</a>
        </div>
      `;
      return;
    }
    list.innerHTML = orders.map(renderOrderCard).join("");

    list.querySelectorAll("[data-cancel]").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm(`Cancel order ${btn.dataset.cancel}? The items will go back in stock and any charge will be reversed.`)) return;
      btn.disabled = true;
      btn.textContent = "Cancelling…";
      try {
        await Api.cancelOrder(btn.dataset.cancel);
        showToast("Order cancelled.");
        loadOrders();
        loadNotifications();
      } catch(err){
        showToast(err.message || "Couldn't cancel this order.");
        btn.disabled = false;
        btn.textContent = "Cancel order";
      }
    }));
  } catch(err){
    document.getElementById("ordersList").innerHTML = `<p class="muted">Couldn't load your orders right now.</p>`;
  }
}

async function loadNotifications(){
  const list = document.getElementById("notifList");
  try {
    const { notifications, unread } = await Api.getNotifications();
    document.getElementById("notifCount").textContent =
      notifications.length ? `${notifications.length} message${notifications.length === 1 ? "" : "s"}${unread ? ` · ${unread} unread` : ""}` : "";
    if (!notifications.length){
      list.innerHTML = `<p class="muted" style="font-size:13.5px;">No notifications yet — order updates will appear here.</p>`;
      return;
    }
    list.innerHTML = notifications.map(n => `
      <div class="notif-item ${n.read ? "" : "unread"}" data-notif="${n.id}">
        <div class="notif-subject">
          ${n.read ? "" : `<span class="notif-unread-dot"></span>`}
          <span>${n.subject}</span>
          <span class="muted" style="font-weight:400; font-size:12px; margin-left:auto;">${fmtDate(n.createdAt)}</span>
        </div>
        <div class="notif-body">${n.body}</div>
      </div>
    `).join("");
    list.querySelectorAll(".notif-item").forEach(el => el.addEventListener("click", () => el.classList.toggle("open")));
    if (unread){
      // Viewing the inbox marks everything read (badge clears on next load).
      Api.markNotificationsRead().catch(() => {});
    }
  } catch(err){
    list.innerHTML = `<p class="muted">Couldn't load notifications right now.</p>`;
  }
}

/* ---------------- Address book ---------------- */
let editingAddressId = null;

function addressFormEls(){
  return {
    name: document.getElementById("afName"),
    phone: document.getElementById("afPhone"),
    line1: document.getElementById("afLine1"),
    line2: document.getElementById("afLine2"),
    city: document.getElementById("afCity"),
    state: document.getElementById("afState"),
    pincode: document.getElementById("afPincode"),
  };
}

function showAddressForm(address){
  editingAddressId = address ? address.id : null;
  const els = addressFormEls();
  Object.keys(els).forEach(k => { els[k].value = address ? (address[k] || "") : ""; });
  document.getElementById("addressError").textContent = "";
  document.getElementById("addressSubmit").textContent = address ? "Update address" : "Save address";
  document.getElementById("addressForm").style.display = "";
}

function hideAddressForm(){
  editingAddressId = null;
  document.getElementById("addressForm").style.display = "none";
}

function renderAddresses(addresses){
  const list = document.getElementById("addressList");
  if (!addresses.length){
    list.innerHTML = `<p class="muted" style="font-size:13px;">No saved addresses yet.</p>`;
    return;
  }
  list.innerHTML = addresses.map(a => `
    <div class="address-card" style="cursor:default;">
      <div class="address-name">${a.name} · ${a.phone}</div>
      <div class="address-lines">${a.line1}${a.line2 ? ", " + a.line2 : ""}, ${a.city}, ${a.state} ${a.pincode}</div>
      <div class="address-actions">
        <button class="link-btn" data-edit-addr="${a.id}">Edit</button>
        <button class="link-btn danger" data-del-addr="${a.id}">Delete</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-edit-addr]").forEach(btn => btn.addEventListener("click", () => {
    const address = addresses.find(a => a.id === btn.dataset.editAddr);
    showAddressForm(address);
  }));
  list.querySelectorAll("[data-del-addr]").forEach(btn => btn.addEventListener("click", async () => {
    try {
      renderAddresses(await Api.deleteAddress(btn.dataset.delAddr));
      showToast("Address removed.");
    } catch(err){
      showToast(err.message || "Couldn't remove that address.");
    }
  }));
}

async function loadAddresses(){
  try {
    renderAddresses(await Api.getAddresses());
  } catch(err){
    document.getElementById("addressList").innerHTML = `<p class="muted">Couldn't load your addresses right now.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireRole(["customer"], { fallback: "dashboard.html" });
  if (!user) return;

  document.getElementById("dashUser").innerHTML = `
    <span class="dash-role-pill customer">Customer</span>
    <span class="dash-user-name">${user.name}</span>
  `;
  document.getElementById("welcomeTitle").textContent = `Welcome back, ${user.name.split(" ")[0]}`;
  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profileEmail").textContent = user.email;
  document.getElementById("pfFullName").value = user.name;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    Api.logout();
    window.location.href = "login.html";
  });

  // Profile editing (name / password)
  document.getElementById("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("profileError");
    errorEl.textContent = "";
    const name = document.getElementById("pfFullName").value.trim();
    const currentPassword = document.getElementById("pfCurrentPassword").value;
    const newPassword = document.getElementById("pfNewPassword").value;

    const patch = {};
    if (name && name !== user.name) patch.name = name;
    if (newPassword){
      patch.currentPassword = currentPassword;
      patch.newPassword = newPassword;
    }
    if (!Object.keys(patch).length){
      errorEl.textContent = "Nothing to update.";
      return;
    }
    const btn = document.getElementById("profileSubmit");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const updated = await Api.updateProfile(patch);
      user.name = updated.name;
      document.getElementById("profileName").textContent = updated.name;
      document.getElementById("welcomeTitle").textContent = `Welcome back, ${updated.name.split(" ")[0]}`;
      document.querySelector("#dashUser .dash-user-name").textContent = updated.name;
      document.getElementById("pfCurrentPassword").value = "";
      document.getElementById("pfNewPassword").value = "";
      showToast("Profile updated.");
    } catch(err){
      errorEl.textContent = err.message || "Couldn't update your profile.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Save changes";
    }
  });

  // Address book
  document.getElementById("addAddressBtn").addEventListener("click", () => showAddressForm(null));
  document.getElementById("addressCancel").addEventListener("click", hideAddressForm);
  document.getElementById("addressForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("addressError");
    errorEl.textContent = "";
    const els = addressFormEls();
    const address = Object.fromEntries(Object.entries(els).map(([k, el]) => [k, el.value.trim()]));
    if (!address.name || !address.line1 || !address.city || !address.state){
      errorEl.textContent = "Please fill in all required fields.";
      return;
    }
    if (!/^[0-9]{10}$/.test(address.phone)){
      errorEl.textContent = "Enter a valid 10-digit phone number.";
      return;
    }
    if (!/^[0-9]{6}$/.test(address.pincode)){
      errorEl.textContent = "Enter a valid 6-digit pincode.";
      return;
    }
    try {
      const wasEditing = !!editingAddressId;
      const addresses = wasEditing
        ? await Api.updateAddress(editingAddressId, address)
        : await Api.addAddress(address);
      renderAddresses(addresses);
      hideAddressForm();
      showToast(wasEditing ? "Address updated." : "Address saved.");
    } catch(err){
      errorEl.textContent = err.message || "Couldn't save the address.";
    }
  });

  loadOrders();
  loadNotifications();
  loadAddresses();
});
