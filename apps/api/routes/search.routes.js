const express = require("express");
const { nanoid } = require("nanoid");
const { readDB, writeDB } = require("../db");
const { requireRole } = require("../middleware/auth");
const { buildSynonymIndex, normalizeQuery, tokenize } = require("../lib/textMatch");
const { rankProducts } = require("../lib/searchScore");
const { parseSemanticQuery } = require("../lib/searchParse");
const { computeAnalytics } = require("../lib/searchAnalytics");

const router = express.Router();
const CLIENT_TRACK_TYPES = ["suggest_click", "product_click", "add_to_cart"];

function userSegmentFor(req){
  if (!req.user) return "guest";
  if (req.user.role === "admin" || req.user.role === "agent") return "staff";
  return "customer";
}

function productBrief(p){
  return {
    id: p.id, name: p.name, category: p.category, department: p.department,
    price: p.price, oldPrice: p.oldPrice, rating: p.rating, reviewCount: p.reviewCount, icon: p.icon,
    badge: p.badge, brand: p.brand, stock: p.stock,
  };
}

// GET /api/search/suggest?q=  — fast, read-only autocomplete. No LLM call,
// no analytics write — this fires on every keystroke, so it must stay cheap.
router.get("/suggest", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const db = await readDB();

  if (q.length < 2){
    return res.json({ products: [], categories: [], brands: [], popularSearches: [], trendingSearches: [], recentSearches: [] });
  }

  const synonymIndex = buildSynonymIndex(db.searchConfig.customSynonyms);
  const normalized = normalizeQuery(q, db, synonymIndex);
  const products = rankProducts(db.products, normalized.correctedTokens, normalized.synonymTokens, db.searchEvents, {}).slice(0, 5).map(productBrief);

  const qLower = q.toLowerCase();
  const categories = db.categories
    .filter(c => c.label.toLowerCase().includes(qLower) || c.id.includes(qLower) || normalized.expandedTokens.includes(c.id))
    .slice(0, 3)
    .map(c => ({ id: c.id, label: c.label, icon: c.icon }));

  const brands = Array.from(new Set(db.products.map(p => p.brand).filter(Boolean)))
    .filter(b => b.toLowerCase().includes(qLower))
    .slice(0, 3)
    .map(b => ({ name: b }));

  const now = Date.now();
  const recentWindowMs = 30 * 24 * 60 * 60 * 1000;
  const searchEvents = db.searchEvents.filter(e => e.type === "search" && now - new Date(e.createdAt).getTime() <= recentWindowMs);
  const counts = new Map();
  for (const e of searchEvents) counts.set(e.query, (counts.get(e.query) || 0) + 1);
  const popularSearches = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([query]) => query);

  const trendWindowMs = 3 * 24 * 60 * 60 * 1000;
  const trendCounts = new Map();
  for (const e of db.searchEvents){
    if (e.type !== "search") continue;
    if (now - new Date(e.createdAt).getTime() > trendWindowMs) continue;
    trendCounts.set(e.query, (trendCounts.get(e.query) || 0) + 1);
  }
  const trendingSearches = Array.from(trendCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([query]) => query);

  let recentSearches = [];
  if (req.user){
    const user = db.users.find(u => u.id === req.user.id);
    if (user && Array.isArray(user.recentSearches)) recentSearches = user.recentSearches.slice(0, 5);
  }

  res.json({ products, categories, brands, popularSearches, trendingSearches, recentSearches });
});

// GET /api/search — main search: typo tolerance, synonym expansion, optional
// AI semantic parsing for natural-language queries, weighted ranking. Logs a
// 'search' analytics event plus impressions for the surfaced results.
router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const db = await readDB();
  const synonymIndex = buildSynonymIndex(db.searchConfig.customSynonyms);
  const normalized = q ? normalizeQuery(q, db, synonymIndex) : { correctedTokens: [], synonymTokens: [], correctedQuery: "", hasTypo: false };

  let semanticFilters = null;
  if (q){
    semanticFilters = await parseSemanticQuery(q, db.settings);
  }

  const filters = {
    category: req.query.category || (semanticFilters && semanticFilters.category) || undefined,
    department: req.query.department || undefined,
    brand: req.query.brand || (semanticFilters && semanticFilters.brand) || undefined,
    priceMin: req.query.priceMin ? Number(req.query.priceMin) : (semanticFilters && semanticFilters.priceMin) || undefined,
    priceMax: req.query.priceMax ? Number(req.query.priceMax) : (semanticFilters && semanticFilters.priceMax) || undefined,
  };

  // Semantic keywords from the LLM extraction are complete words, not
  // something the user is mid-typing — treat them like synonym-expanded
  // tokens (exact-word match only, see lib/searchScore.js).
  const synonymTokens = normalized.synonymTokens.concat(
    semanticFilters ? (semanticFilters.keywords || []).flatMap(tokenize) : []
  );

  const results = rankProducts(db.products, normalized.correctedTokens, synonymTokens, db.searchEvents, filters);
  const products = results.map(productBrief);

  // --- Analytics (best-effort; never blocks the response on failure) ---
  try {
    const sessionId = String(req.query.sessionId || "");
    const now = new Date().toISOString();
    const loggedQuery = normalized.correctedQuery || q;
    if (q || filters.category || filters.brand){
      db.searchEvents.push({
        id: nanoid(10), type: "search", query: loggedQuery, resultCount: products.length,
        searchSessionId: sessionId, userId: req.user ? req.user.id : null,
        userSegment: userSegmentFor(req), deviceType: req.query.deviceType || "unknown",
        location: "Unknown", createdAt: now,
      });
      for (const p of products.slice(0, 8)){
        db.searchEvents.push({
          id: nanoid(10), type: "impression", query: loggedQuery, productId: p.id, category: p.category,
          brand: p.brand, searchSessionId: sessionId, userId: req.user ? req.user.id : null,
          userSegment: userSegmentFor(req), deviceType: req.query.deviceType || "unknown", createdAt: now,
        });
      }
      if (req.user && q){
        const user = db.users.find(u => u.id === req.user.id);
        if (user){
          if (!Array.isArray(user.recentSearches)) user.recentSearches = [];
          user.recentSearches = [q, ...user.recentSearches.filter(s => s.toLowerCase() !== q.toLowerCase())].slice(0, 10);
        }
      }
      await writeDB(db);
    }
  } catch (e){
    console.error("Search analytics logging failed (non-fatal):", e.message);
  }

  res.json({
    products,
    query: q,
    correctedQuery: normalized.hasTypo ? normalized.correctedQuery : null,
    didYouMean: normalized.hasTypo ? q : null,
    appliedFilters: semanticFilters ? {
      category: semanticFilters.category, useCase: semanticFilters.useCase, features: semanticFilters.features,
      priceMax: semanticFilters.priceMax, priceMin: semanticFilters.priceMin, brand: semanticFilters.brand,
    } : null,
    semantic: !!semanticFilters,
    clarify: semanticFilters ? semanticFilters.clarify : [],
    zeroResult: products.length === 0,
  });
});

// POST /api/search/track — client-reported engagement events (fire-and-forget).
// 'search'/'impression'/'purchase' are server-generated only (see above and
// orders.routes.js) — never trusted from the client, to keep analytics honest.
router.post("/track", async (req, res) => {
  try {
    const { type, query, productId, searchSessionId, deviceType, resultCount } = req.body || {};
    if (!CLIENT_TRACK_TYPES.includes(type)){
      return res.status(400).json({ error: `type must be one of: ${CLIENT_TRACK_TYPES.join(", ")}` });
    }
    const db = await readDB();
    const product = productId ? db.products.find(p => p.id === productId) : null;
    db.searchEvents.push({
      id: nanoid(10), type, query: query || null, productId: productId || null,
      category: product ? product.category : null, brand: product ? product.brand : null,
      resultCount: resultCount != null ? Number(resultCount) : undefined,
      searchSessionId: searchSessionId || null, userId: req.user ? req.user.id : null,
      userSegment: userSegmentFor(req), deviceType: deviceType || "unknown",
      location: "Unknown", createdAt: new Date().toISOString(),
    });
    await writeDB(db);
    res.json({ ok: true });
  } catch (e){
    // Analytics must never break the shopping experience.
    res.json({ ok: false });
  }
});

// GET /api/search/analytics — admin only. Filters: from, to, category, brand,
// deviceType, location, userSegment.
router.get("/analytics", requireRole("admin", "agent"), async (req, res) => {
  const db = await readDB();
  const { from, to, category, brand, deviceType, location, userSegment } = req.query;
  const analytics = computeAnalytics(db, { from, to, category, brand, deviceType, location, userSegment });
  res.json({ analytics });
});

// GET /api/search/synonyms — admin only. Lists custom synonym overrides.
router.get("/synonyms", requireRole("admin", "agent"), async (req, res) => {
  const db = await readDB();
  res.json({ synonyms: db.searchConfig.customSynonyms || {} });
});

// POST /api/search/synonyms — admin only. body: { term, canonical }
router.post("/synonyms", requireRole("admin", "agent"), async (req, res) => {
  const { term, canonical } = req.body || {};
  if (!term || !canonical){
    return res.status(400).json({ error: "Both term and canonical are required." });
  }
  const db = await readDB();
  if (!db.searchConfig) db.searchConfig = { customSynonyms: {} };
  db.searchConfig.customSynonyms[String(term).toLowerCase().trim()] = String(canonical).toLowerCase().trim();
  await writeDB(db);
  res.status(201).json({ synonyms: db.searchConfig.customSynonyms });
});

// DELETE /api/search/synonyms/:term — admin only.
router.delete("/synonyms/:term", requireRole("admin", "agent"), async (req, res) => {
  const db = await readDB();
  if (db.searchConfig && db.searchConfig.customSynonyms){
    delete db.searchConfig.customSynonyms[req.params.term.toLowerCase()];
  }
  await writeDB(db);
  res.json({ synonyms: db.searchConfig.customSynonyms || {} });
});

module.exports = router;
