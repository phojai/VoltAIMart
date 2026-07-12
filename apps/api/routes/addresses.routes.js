const express = require("express");
const { nanoid } = require("nanoid");
const { readDB, writeDB } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const ADDRESS_FIELDS = ["name", "phone", "line1", "city", "state", "pincode"];

function sanitize(body){
  const missing = ADDRESS_FIELDS.find(f => !String(body?.[f] || "").trim());
  if (missing) return { error: `Address is missing "${missing}".` };
  return {
    address: {
      name: String(body.name).trim(),
      phone: String(body.phone).trim(),
      line1: String(body.line1).trim(),
      line2: String(body.line2 || "").trim(),
      city: String(body.city).trim(),
      state: String(body.state).trim(),
      pincode: String(body.pincode).trim(),
    },
  };
}

function getUser(db, req, res){
  const user = db.users.find(u => u.id === req.user.id);
  if (!user){ res.status(404).json({ error: "User not found." }); return null; }
  if (!Array.isArray(user.addresses)) user.addresses = [];
  return user;
}

// GET /api/addresses — the current user's saved addresses
router.get("/", requireAuth, async (req, res) => {
  const db = await readDB();
  const user = getUser(db, req, res);
  if (!user) return;
  res.json({ addresses: user.addresses });
});

// POST /api/addresses — add a new address
router.post("/", requireAuth, async (req, res) => {
  const db = await readDB();
  const user = getUser(db, req, res);
  if (!user) return;
  const { address, error } = sanitize(req.body);
  if (error) return res.status(400).json({ error });
  address.id = nanoid(8);
  user.addresses.push(address);
  await writeDB(db);
  res.status(201).json({ addresses: user.addresses });
});

// PUT /api/addresses/:id — update a saved address
router.put("/:id", requireAuth, async (req, res) => {
  const db = await readDB();
  const user = getUser(db, req, res);
  if (!user) return;
  const idx = user.addresses.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Address not found." });
  const { address, error } = sanitize(req.body);
  if (error) return res.status(400).json({ error });
  user.addresses[idx] = { ...address, id: req.params.id };
  await writeDB(db);
  res.json({ addresses: user.addresses });
});

// DELETE /api/addresses/:id — remove a saved address
router.delete("/:id", requireAuth, async (req, res) => {
  const db = await readDB();
  const user = getUser(db, req, res);
  if (!user) return;
  user.addresses = user.addresses.filter(a => a.id !== req.params.id);
  await writeDB(db);
  res.json({ addresses: user.addresses });
});

module.exports = router;
