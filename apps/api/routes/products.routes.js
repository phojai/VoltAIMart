const express = require("express");
const { nanoid } = require("nanoid");
const { readDB, writeDB } = require("../db");
const { requireRole } = require("../middleware/auth");
const { searchCatalog } = require("../lib/catalogSearch");

const router = express.Router();

// GET /api/products?department=&category=&q=  — public
router.get("/", async (req, res) => {
  const db = await readDB();
  const { department, category, q } = req.query;
  const list = searchCatalog(db, { department, category, q });
  res.json({ products: list });
});

// GET /api/products/:id — public
router.get("/:id", async (req, res) => {
  const db = await readDB();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json({ product });
});

// POST /api/products — admin or agent
router.post("/", requireRole("admin", "agent"), async (req, res) => {
  const db = await readDB();
  const body = req.body || {};

  if (!body.name || !body.category || body.price == null){
    return res.status(400).json({ error: "name, category, and price are required." });
  }
  const categoryMeta = db.categories.find(c => c.id === body.category);
  if (!categoryMeta){
    return res.status(400).json({ error: `Unknown category "${body.category}".` });
  }

  const now = new Date().toISOString();
  const product = {
    id: body.id && !db.products.some(p => p.id === body.id) ? body.id : nanoid(8),
    name: String(body.name).trim(),
    category: body.category,
    department: categoryMeta.department,
    price: Number(body.price),
    oldPrice: body.oldPrice ? Number(body.oldPrice) : undefined,
    rating: body.rating ? Number(body.rating) : 4.5,
    icon: body.icon || "📦",
    badge: body.badge || undefined,
    tagline: body.tagline || "",
    description: body.description || "",
    specs: body.specs && typeof body.specs === "object" ? body.specs : {},
    keywords: Array.isArray(body.keywords) ? body.keywords : [],
    createdAt: now,
    updatedAt: now,
    createdBy: req.user.email,
  };

  db.products.unshift(product);
  await writeDB(db);
  res.status(201).json({ product });
});

// PUT /api/products/:id — admin or agent
router.put("/:id", requireRole("admin", "agent"), async (req, res) => {
  const db = await readDB();
  const idx = db.products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Product not found." });

  const body = req.body || {};
  const existing = db.products[idx];
  const categoryMeta = body.category ? db.categories.find(c => c.id === body.category) : null;
  if (body.category && !categoryMeta){
    return res.status(400).json({ error: `Unknown category "${body.category}".` });
  }

  db.products[idx] = {
    ...existing,
    ...body,
    id: existing.id,
    department: categoryMeta ? categoryMeta.department : existing.department,
    updatedAt: new Date().toISOString(),
  };
  await writeDB(db);
  res.json({ product: db.products[idx] });
});

// DELETE /api/products/:id — admin or agent
router.delete("/:id", requireRole("admin", "agent"), async (req, res) => {
  const db = await readDB();
  const idx = db.products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Product not found." });
  const [removed] = db.products.splice(idx, 1);
  await writeDB(db);
  res.json({ product: removed });
});

module.exports = router;
