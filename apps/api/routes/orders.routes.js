const express = require("express");
const { nanoid } = require("nanoid");
const { readDB, writeDB } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendOrderEmail } = require("../lib/notify");

/**
 * Attributes revenue back to the search session that led to this order, when
 * the client reports one (i.e. checkout followed a live search this visit).
 * Logs one 'purchase' search-analytics event per line item — this is the ONLY
 * place 'purchase' events are created, so revenue-from-search always reflects
 * a real, completed order rather than a client-supplied number.
 */
function recordSearchPurchaseEvents(db, order, searchSessionId){
  if (!searchSessionId) return;
  const originatingSearch = db.searchEvents
    .filter(e => e.type === "search" && e.searchSessionId === searchSessionId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const query = originatingSearch ? originatingSearch.query : null;
  const now = new Date().toISOString();
  for (const item of order.items){
    const product = db.products.find(p => p.id === item.productId);
    db.searchEvents.push({
      id: nanoid(10), type: "purchase", query, productId: item.productId,
      category: product ? product.category : null, brand: product ? product.brand : null,
      revenue: item.lineTotal, orderId: order.id, searchSessionId,
      userId: order.userId, userSegment: order.userId ? "customer" : "guest",
      createdAt: now,
    });
  }
}

const router = express.Router();
const STATUSES = ["processing", "shipped", "delivered", "cancelled"];

/** Puts each line item's quantity back into product stock (e.g. on cancellation). */
function restoreStock(db, order){
  for (const item of order.items){
    const product = db.products.find(p => p.id === item.productId);
    if (product){
      product.stock += item.qty;
      product.updatedAt = new Date().toISOString();
    }
  }
}

// GET /api/orders — admin/agent see all, customer sees only their own
router.get("/", requireAuth, async (req, res) => {
  const db = await readDB();
  let list = db.orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (req.user.role === "customer"){
    list = list.filter(o => o.userId === req.user.id);
  }
  res.json({ orders: list });
});

// GET /api/orders/track?id=ORD-xxx&email=... — public guest/anyone order tracking.
// Must be declared before /:id so "track" isn't swallowed as an order id.
router.get("/track", async (req, res) => {
  const { id, email } = req.query;
  if (!id || !email){
    return res.status(400).json({ error: "Both id and email are required." });
  }
  const db = await readDB();
  const order = db.orders.find(o => o.id.toLowerCase() === String(id).trim().toLowerCase());
  if (!order || order.userEmail.toLowerCase() !== String(email).trim().toLowerCase()){
    return res.status(404).json({ error: "No order found for that ID and email." });
  }
  // Sanitized view — enough to track, without exposing full address/payment.
  res.json({
    order: {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      userName: order.userName,
      items: order.items.map(i => ({ name: i.name, icon: i.icon, qty: i.qty, lineTotal: i.lineTotal })),
      total: order.total,
      city: order.shippingAddress ? order.shippingAddress.city : undefined,
      pincode: order.shippingAddress ? order.shippingAddress.pincode : undefined,
    },
  });
});

// GET /api/orders/:id — owner, or admin/agent
router.get("/:id", requireAuth, async (req, res) => {
  const db = await readDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (req.user.role === "customer" && order.userId !== req.user.id){
    return res.status(403).json({ error: "You can only view your own orders." });
  }
  res.json({ order });
});

const ADDRESS_FIELDS = ["name", "phone", "line1", "city", "state", "pincode"];

// POST /api/orders — authenticated user, OR guest checkout (no token; requires
// a contact `email` in the body so the order can be confirmed and tracked).
// body: { items: [{ productId, qty }], shippingAddress: {...}, payment: {...}, email?, saveAddress? }
router.post("/", async (req, res) => {
  const db = await readDB();
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length){
    return res.status(400).json({ error: "Order must include at least one item." });
  }

  const shippingAddress = req.body?.shippingAddress || {};
  const missingField = ADDRESS_FIELDS.find(f => !String(shippingAddress[f] || "").trim());
  if (missingField){
    return res.status(400).json({ error: `Shipping address is missing "${missingField}".` });
  }

  let guestEmail = null;
  if (!req.user){
    guestEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)){
      return res.status(400).json({ error: "A valid contact email is required for guest checkout." });
    }
  }

  const payment = req.body?.payment || {};
  if (payment.method !== "upi" && payment.method !== "card"){
    return res.status(400).json({ error: 'payment.method must be "upi" or "card".' });
  }

  const lineItems = [];
  const products = [];
  for (const item of items){
    const product = db.products.find(p => p.id === item.productId);
    if (!product) continue;
    const qty = Math.max(1, Number(item.qty) || 1);
    if (qty > product.stock){
      return res.status(409).json({ error: `Only ${product.stock} left of "${product.name}" — please adjust the quantity.` });
    }
    products.push({ product, qty });
    lineItems.push({
      productId: product.id,
      name: product.name,
      icon: product.icon,
      price: product.price,
      qty,
      lineTotal: Math.round(product.price * qty),
    });
  }

  if (!lineItems.length){
    return res.status(400).json({ error: "None of the submitted items were found in the catalog." });
  }

  // Prices are in INR (₹) — free shipping over ₹4,150, otherwise a flat ₹829 fee.
  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const shipping = subtotal > 4150 ? 0 : 829;
  const tax = Math.round(subtotal * 0.08);
  const total = Math.round(subtotal + shipping + tax);

  // --- SIMULATED PAYMENT --- No real gateway is integrated (no credentials
  // available). A real integration (Razorpay/Stripe/etc.) would charge here
  // and set paymentStatus from its response instead of hardcoding "paid".
  // The client only ever sends display-safe fields (e.g. card last4) — full
  // card numbers/CVVs are never transmitted to or stored by this server.
  const paymentRecord = payment.method === "upi"
    ? { method: "upi", vpa: String(payment.vpa || "").trim() }
    : { method: "card", last4: String(payment.last4 || "").slice(-4), cardName: String(payment.cardName || "").trim(), expiry: String(payment.expiry || "").trim() };
  paymentRecord.paymentRef = `SIM-${nanoid(8).toUpperCase()}`;
  paymentRecord.paymentStatus = "paid";

  const order = {
    id: `ORD-${nanoid(8).toUpperCase()}`,
    userId: req.user ? req.user.id : null,
    userEmail: req.user ? req.user.email : guestEmail,
    userName: req.user ? req.user.name : String(shippingAddress.name).trim(),
    guest: !req.user || undefined,
    items: lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    shipping,
    tax,
    total,
    shippingAddress: {
      name: String(shippingAddress.name).trim(),
      phone: String(shippingAddress.phone).trim(),
      line1: String(shippingAddress.line1).trim(),
      line2: String(shippingAddress.line2 || "").trim(),
      city: String(shippingAddress.city).trim(),
      state: String(shippingAddress.state).trim(),
      pincode: String(shippingAddress.pincode).trim(),
    },
    payment: paymentRecord,
    status: "processing",
    createdAt: new Date().toISOString(),
  };

  products.forEach(({ product, qty }) => {
    product.stock -= qty;
    product.updatedAt = new Date().toISOString();
  });

  if (req.user){
    const user = db.users.find(u => u.id === req.user.id);
    if (user){
      user.lastShippingAddress = order.shippingAddress;
      // Optionally save to the user's address book (deduped by line1 + pincode).
      if (req.body?.saveAddress){
        if (!Array.isArray(user.addresses)) user.addresses = [];
        const exists = user.addresses.some(a =>
          a.line1.toLowerCase() === order.shippingAddress.line1.toLowerCase() &&
          a.pincode === order.shippingAddress.pincode
        );
        if (!exists){
          user.addresses.push({ id: nanoid(8), ...order.shippingAddress });
        }
      }
    }
  }

  sendOrderEmail(db, order, "order_confirmation");
  try { recordSearchPurchaseEvents(db, order, req.body?.searchSessionId); }
  catch (e){ console.error("Search purchase attribution failed (non-fatal):", e.message); }

  db.orders.push(order);
  await writeDB(db);
  res.status(201).json({ order });
});

// POST /api/orders/:id/cancel — the order's owner (or admin/agent) cancels a
// still-processing order. Restores stock and records a cancellation email.
router.post("/:id/cancel", requireAuth, async (req, res) => {
  const db = await readDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });

  const isStaff = req.user.role === "admin" || req.user.role === "agent";
  if (!isStaff && order.userId !== req.user.id){
    return res.status(403).json({ error: "You can only cancel your own orders." });
  }
  if (order.status !== "processing"){
    return res.status(409).json({ error: `Only "processing" orders can be cancelled — this one is "${order.status}".` });
  }

  order.status = "cancelled";
  order.updatedAt = new Date().toISOString();
  restoreStock(db, order);
  sendOrderEmail(db, order, "order_cancelled");

  await writeDB(db);
  res.json({ order });
});

// PATCH /api/orders/:id — admin/agent only; update order status.
// Status transitions record a simulated email; cancelling restores stock.
router.patch("/:id", requireRole("admin", "agent"), async (req, res) => {
  const db = await readDB();
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Order not found." });

  const { status } = req.body || {};
  if (!STATUSES.includes(status)){
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}` });
  }
  const order = db.orders[idx];
  const previous = order.status;
  order.status = status;
  order.updatedAt = new Date().toISOString();

  if (status !== previous){
    if (status === "cancelled") restoreStock(db, order);
    const emailType = { shipped: "order_shipped", delivered: "order_delivered", cancelled: "order_cancelled" }[status];
    if (emailType) sendOrderEmail(db, order, emailType);
  }

  await writeDB(db);
  res.json({ order });
});

module.exports = router;
