const express = require("express");
const { readDB, writeDB } = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
const ROLES = ["admin", "agent", "customer"];

function publicUser(u){
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

// GET /api/users — admin only
router.get("/", requireRole("admin"), async (req, res) => {
  const db = await readDB();
  res.json({ users: db.users.map(publicUser) });
});

// PATCH /api/users/:id — admin only; currently supports changing role
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const db = await readDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "User not found." });

  const { role } = req.body || {};
  if (role){
    if (!ROLES.includes(role)){
      return res.status(400).json({ error: `role must be one of: ${ROLES.join(", ")}` });
    }
    if (db.users[idx].id === req.user.id && role !== "admin"){
      return res.status(400).json({ error: "You can't demote your own account." });
    }
    db.users[idx].role = role;
  }
  await writeDB(db);
  res.json({ user: publicUser(db.users[idx]) });
});

module.exports = router;
