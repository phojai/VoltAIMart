/* ============================================================
   VoltAIMart — Customer account page
   ============================================================ */

function fmtMoney(n){ return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(iso){ return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }

function renderOrderCard(order){
  return `
    <div class="card" style="margin-bottom:16px; padding:22px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:12px; flex-wrap:wrap;">
        <div>
          <div class="mono" style="font-size:13px;">${order.id}</div>
          <div class="muted" style="font-size:12.5px;">Placed ${fmtDate(order.createdAt)}</div>
        </div>
        <span class="status-select status-${order.status}" style="pointer-events:none;">${order.status}</span>
      </div>
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
    </div>
  `;
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
  document.getElementById("logoutBtn").addEventListener("click", () => {
    Api.logout();
    window.location.href = "login.html";
  });

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
  } catch(err){
    document.getElementById("ordersList").innerHTML = `<p class="muted">Couldn't load your orders right now.</p>`;
  }
});
