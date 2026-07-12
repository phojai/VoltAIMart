const express = require("express");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const { readDB, writeDB } = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

function publicUser(u){
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    lastShippingAddress: u.lastShippingAddress || null,
    addresses: Array.isArray(u.addresses) ? u.addresses : [],
  };
}

// POST /api/auth/login  { email, password }
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password){
    return res.status(400).json({ error: "Email and password are required." });
  }
  const db = await readDB();
  const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)){
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

// POST /api/auth/register  { name, email, password }  — always creates a "customer" account.
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password){
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  if (String(password).length < 6){
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  const db = await readDB();
  const exists = db.users.some(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (exists){
    return res.status(409).json({ error: "An account with that email already exists." });
  }
  const user = {
    id: nanoid(10),
    name,
    email: String(email).toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: "customer",
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  await writeDB(db);
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

// GET /api/auth/me — whoami, requires a valid token
router.get("/me", requireAuth, async (req, res) => {
  const db = await readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user: publicUser(user) });
});

// PATCH /api/auth/me — update own profile: { name?, currentPassword?, newPassword? }.
// Changing the password requires the current one. Returns a fresh token since
// the JWT embeds the name.
router.patch("/me", requireAuth, async (req, res) => {
  const db = await readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });

  const { name, currentPassword, newPassword } = req.body || {};

  if (name != null){
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: "Name cannot be empty." });
    user.name = trimmed;
  }

  if (newPassword != null){
    if (String(newPassword).length < 6){
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    if (!currentPassword || !bcrypt.compareSync(String(currentPassword), user.passwordHash)){
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
  }

  await writeDB(db);
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

module.exports = router;
