const express = require("express");
const { readDB, writeDB } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/** A user's notifications: matched by userId, or by email for orders placed
    as a guest with the same address before signing up. */
function ownNotifications(db, user){
  const email = user.email.toLowerCase();
  return db.notifications.filter(n => n.userId === user.id || (n.email || "").toLowerCase() === email);
}

// GET /api/notifications — the current user's simulated-email inbox, newest first
router.get("/", requireAuth, async (req, res) => {
  const db = await readDB();
  const list = ownNotifications(db, req.user)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({
    notifications: list,
    unread: list.filter(n => !n.read).length,
  });
});

// POST /api/notifications/mark-read — mark all of the current user's as read
router.post("/mark-read", requireAuth, async (req, res) => {
  const db = await readDB();
  let changed = 0;
  for (const n of ownNotifications(db, req.user)){
    if (!n.read){ n.read = true; changed++; }
  }
  if (changed) await writeDB(db);
  res.json({ ok: true, marked: changed });
});

module.exports = router;
