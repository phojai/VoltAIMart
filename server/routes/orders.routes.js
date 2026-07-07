const express = require("express");
const { nanoid } = require("nanoid");
const { readDB, writeDB } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const STATUSES = ["processing", "shipped", "delivered", "cancelled"];

// GET /api/orders — admin/agent see all, customer sees only their own
router.get("/", requireAuth, async (req, res) => {
  const db = await readDB();
  let list = db.orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (req.user.role === "customer"){
    list = list.filter(o => o.userId === req.user.id);
  }
  res.json({ orders: list });
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

// POST /api/orders — any authenticated user; { items: [{ productId, qty }] }
router.post("/", requireAuth, async (req, res) => {
  const db = await readDB();
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length){
    return res.status(400).json({ error: "Order must include at least one item." });
  }

  const lineItems = [];
  for (const item of items){
    const product = db.products.find(p => p.id === item.productId);
    if (!product) continue;
    const qty = Math.max(1, Number(item.qty) || 1);
    lineItems.push({
      productId: product.id,
      name: product.name,
      icon: product.icon,
      price: product.price,
      qty,
      lineTotal: Math.round(product.price * qty * 100) / 100,
    });
  }

  if (!lineItems.length){
    return res.status(400).json({ error: "None of the submitted items were found in the catalog." });
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const shipping = subtotal > 50 ? 0 : 9.99;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const total = Math.round((subtotal + shipping + tax) * 100) / 100;

  const order = {
    id: `ORD-${nanoid(8).toUpperCase()}`,
    userId: req.user.id,
    userEmail: req.user.email,
    userName: req.user.name,
    items: lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    shipping,
    tax,
    total,
    status: "processing",
    createdAt: new Date().toISOString(),
  };

  db.orders.push(order);
  await writeDB(db);
  res.status(201).json({ order });
});

// PATCH /api/orders/:id — admin/agent only; update order status
router.patch("/:id", requireRole("admin", "agent"), async (req, res) => {
  const db = await readDB();
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Order not found." });

  const { status } = req.body || {};
  if (!STATUSES.includes(status)){
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}` });
  }
  db.orders[idx].status = status;
  db.orders[idx].updatedAt = new Date().toISOString();
  await writeDB(db);
  res.json({ order: db.orders[idx] });
});

module.exports = router;
