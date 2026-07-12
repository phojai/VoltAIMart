const express = require("express");
const { readDB, writeDB } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/wishlist — the current user's saved product ids
router.get("/", requireAuth, async (req, res) => {
  const db = await readDB();
  res.json({ productIds: db.wishlists[req.user.id] || [] });
});

// POST /api/wishlist/:productId — add a product to the current user's wishlist
router.post("/:productId", requireAuth, async (req, res) => {
  const db = await readDB();
  const product = db.products.find(p => p.id === req.params.productId);
  if (!product) return res.status(404).json({ error: "Product not found." });

  const list = db.wishlists[req.user.id] || [];
  if (!list.includes(req.params.productId)) list.push(req.params.productId);
  db.wishlists[req.user.id] = list;

  await writeDB(db);
  res.json({ productIds: list });
});

// DELETE /api/wishlist/:productId — remove a product from the current user's wishlist
router.delete("/:productId", requireAuth, async (req, res) => {
  const db = await readDB();
  const list = (db.wishlists[req.user.id] || []).filter(id => id !== req.params.productId);
  db.wishlists[req.user.id] = list;

  await writeDB(db);
  res.json({ productIds: list });
});

module.exports = router;
