const express = require("express");
const { readDB } = require("../db");

const router = express.Router();

// GET /api/meta — departments + categories (static taxonomy, public)
router.get("/", (req, res) => {
  const db = readDB();
  res.json({ departments: db.departments, categories: db.categories });
});

module.exports = router;
