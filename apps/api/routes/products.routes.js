const express = require("express");
const { nanoid } = require("nanoid");
const { readDB, writeDB } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { searchCatalog } = require("../lib/catalogSearch");

const router = express.Router();

/** Recomputes a product's aggregate rating + reviewCount from db.reviews. Mutates db.products in place. */
function recomputeRating(db, productId){
  const product = db.products.find(p => p.id === productId);
  if (!product) return;
  const productReviews = db.reviews.filter(r => r.productId === productId);
  product.reviewCount = productReviews.length;
  product.rating = productReviews.length
    ? Math.round((productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length) * 10) / 10
    : product.rating;
  product.updatedAt = new Date().toISOString();
}

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

// GET /api/products/:id/reviews — public
router.get("/:id/reviews", async (req, res) => {
  const db = await readDB();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  const reviews = db.reviews
    .filter(r => r.productId === req.params.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reviews });
});

// POST /api/products/:id/reviews — any authenticated user; { rating, comment }
// Upserts: a user resubmitting for the same product edits their existing review
// rather than creating a duplicate, so reviewCount stays accurate.
router.post("/:id/reviews", requireAuth, async (req, res) => {
  const db = await readDB();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });

  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5){
    return res.status(400).json({ error: "rating must be an integer from 1 to 5." });
  }
  const comment = String(req.body?.comment || "").trim().slice(0, 1000);
  const now = new Date().toISOString();

  const existingIdx = db.reviews.findIndex(r => r.productId === req.params.id && r.userId === req.user.id);
  let review;
  if (existingIdx !== -1){
    review = db.reviews[existingIdx] = { ...db.reviews[existingIdx], rating, comment, updatedAt: now };
  } else {
    review = { id: nanoid(10), productId: req.params.id, userId: req.user.id, userName: req.user.name, rating, comment, createdAt: now };
    db.reviews.unshift(review);
  }

  recomputeRating(db, req.params.id);
  await writeDB(db);
  res.status(existingIdx !== -1 ? 200 : 201).json({ review, product: db.products.find(p => p.id === req.params.id) });
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
    stock: Math.max(0, parseInt(body.stock, 10) || 0),
    reviewCount: 0,
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
  if (body.stock != null){
    body.stock = Math.max(0, parseInt(body.stock, 10) || 0);
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
