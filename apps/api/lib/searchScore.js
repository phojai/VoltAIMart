/* ============================================================
   VoltAIMart — search relevance + ranking.

   Final score blends text relevance against the ranking formula from
   the search spec:
     40% semantic/text relevance + 25% CTR + 20% add-to-cart rate +
     10% purchase rate + 5% inventory availability.
   CTR/add-to-cart/purchase rates come from real, accumulating
   db.searchEvents — they start at 0 for an unseen product and grow
   with actual usage, never fabricated.
   ============================================================ */
const { tokenize, levenshtein } = require("./textMatch");

const WEIGHTS = { relevance: 0.40, ctr: 0.25, addToCart: 0.20, purchase: 0.10, availability: 0.05 };

/**
 * Loose fuzzy "contains" check for a token the user actually typed (or a
 * typo-corrected version of it) against a field's tokens — prefix-tolerant
 * both ways so partial typing ("ear" -> "earbuds") and simple plurals
 * ("watches" -> "watch") both work.
 */
function fuzzyTokenMatch(queryToken, fieldTokens){
  for (const ft of fieldTokens){
    if (ft === queryToken) return 1;
    // Prefix/fuzzy tolerance only kicks in once both sides are long enough to
    // be meaningful — a stray 1-2 char token (e.g. "t" from a hyphen-split
    // "t-shirt" keyword) would otherwise prefix-match almost anything.
    if (queryToken.length < 3 || ft.length < 3) continue;
    if (ft.startsWith(queryToken) || queryToken.startsWith(ft)) return 1;
    if (Math.abs(ft.length - queryToken.length) <= 2 && queryToken.length >= 4){
      const budget = queryToken.length <= 5 ? 1 : 2;
      if (levenshtein(queryToken, ft) <= budget) return 0.6;
    }
  }
  return 0;
}

/**
 * Strict check for a synonym-EXPANDED token (a complete dictionary word the
 * user didn't type, e.g. "mobile" -> "smartphone"). Exact-word only — no
 * prefix tolerance — so a generic short field word (e.g. "smart" in "Smart
 * Speaker") can't falsely collide with an unrelated long synonym like
 * "smartphone" just because one happens to prefix the other.
 */
function exactTokenMatch(token, fieldTokens){
  return fieldTokens.includes(token) ? 1 : 0;
}

/** 0..1 text-relevance score for one product against the query. */
function textRelevance(product, coreTokens, synonymTokens = []){
  if (!coreTokens.length && !synonymTokens.length) return 0;
  const nameTokens = tokenize(product.name);
  const categoryTokens = tokenize(product.category);
  const brandTokens = tokenize(product.brand || "");
  const keywordTokens = (product.keywords || []).flatMap(tokenize);
  const taglineTokens = tokenize(product.tagline || "");

  const fields = [
    { tokens: nameTokens, weight: 1.0 },
    { tokens: categoryTokens, weight: 0.8 },
    { tokens: brandTokens, weight: 0.7 },
    { tokens: keywordTokens, weight: 0.75 },
    { tokens: taglineTokens, weight: 0.5 },
  ];

  const allTokens = coreTokens.length + synonymTokens.length;
  let score = 0;
  const perTokenMax = 1 / allTokens;
  for (const qt of coreTokens){
    let best = 0;
    for (const f of fields) best = Math.max(best, fuzzyTokenMatch(qt, f.tokens) * f.weight);
    score += best * perTokenMax;
  }
  for (const st of synonymTokens){
    let best = 0;
    for (const f of fields) best = Math.max(best, exactTokenMatch(st, f.tokens) * f.weight);
    score += best * perTokenMax;
  }
  // Small bonus for a whole-phrase substring hit (e.g. "buds pro" inside the name).
  const phrase = coreTokens.join(" ");
  if (phrase.length > 3 && product.name.toLowerCase().includes(phrase)) score = Math.min(1, score + 0.15);
  return Math.min(1, score);
}

/** Aggregates real event counts per product from db.searchEvents. */
function buildEngagementStats(searchEvents){
  const stats = new Map(); // productId -> { impressions, clicks, addToCart, purchases }
  const get = (id) => {
    if (!stats.has(id)) stats.set(id, { impressions: 0, clicks: 0, addToCart: 0, purchases: 0 });
    return stats.get(id);
  };
  for (const ev of searchEvents){
    if (!ev.productId) continue;
    const s = get(ev.productId);
    if (ev.type === "suggest_click" || ev.type === "product_click") s.clicks++;
    else if (ev.type === "add_to_cart") s.addToCart++;
    else if (ev.type === "purchase") s.purchases++;
  }
  return stats;
}

function engagementRates(productId, stats){
  const s = stats.get(productId);
  if (!s || !s.clicks) return { ctr: 0, addToCartRate: 0, purchaseRate: 0 };
  return {
    ctr: Math.min(1, s.clicks / Math.max(1, s.clicks + 5)), // damped so a couple of clicks doesn't hit 100%
    addToCartRate: s.clicks ? Math.min(1, s.addToCart / s.clicks) : 0,
    purchaseRate: s.clicks ? Math.min(1, s.purchases / s.clicks) : 0,
  };
}

/**
 * Scores + ranks products for a query. `coreTokens` are what the user typed
 * (typo-corrected) — matched with prefix/fuzzy tolerance. `synonymTokens` are
 * additional words pulled in via synonym expansion — matched exact-word only
 * (see textRelevance). `filters` may include category, department, brand,
 * priceMin, priceMax (hard filters applied before scoring).
 */
function rankProducts(products, coreTokens, synonymTokens, searchEvents, filters = {}){
  let candidates = products;
  if (filters.category) candidates = candidates.filter(p => p.category === filters.category);
  if (filters.department) candidates = candidates.filter(p => p.department === filters.department);
  if (filters.brand) candidates = candidates.filter(p => (p.brand || "").toLowerCase() === filters.brand.toLowerCase());
  if (filters.priceMax != null) candidates = candidates.filter(p => p.price <= filters.priceMax);
  if (filters.priceMin != null) candidates = candidates.filter(p => p.price >= filters.priceMin);

  const stats = buildEngagementStats(searchEvents);
  const hasTextQuery = coreTokens.length > 0 || synonymTokens.length > 0;

  const scored = candidates.map(product => {
    const relevance = hasTextQuery ? textRelevance(product, coreTokens, synonymTokens) : 1;
    const { ctr, addToCartRate, purchaseRate } = engagementRates(product.id, stats);
    const availability = product.stock > 0 ? 1 : 0;
    const finalScore =
      WEIGHTS.relevance * relevance +
      WEIGHTS.ctr * ctr +
      WEIGHTS.addToCart * addToCartRate +
      WEIGHTS.purchase * purchaseRate +
      WEIGHTS.availability * availability;
    return { product, relevance, finalScore };
  });

  // A query was given but nothing matched at all textually — treat as zero-result
  // rather than falling back to the full catalog ranked by engagement alone.
  const filtered = hasTextQuery ? scored.filter(s => s.relevance > 0.12) : scored;

  filtered.sort((a, b) => b.finalScore - a.finalScore || b.product.rating - a.product.rating);
  return filtered.map(s => s.product);
}

module.exports = { rankProducts, textRelevance, buildEngagementStats, engagementRates, WEIGHTS };
