/* ============================================================
   VoltAIMart — search analytics aggregation.

   Every number here is computed from real, accumulating
   db.searchEvents — nothing is fabricated. On a fresh install (or
   right after this feature ships) most aggregates legitimately read
   zero until real traffic happens; callers must render an honest
   empty state rather than a fake number.
   ============================================================ */

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(iso){ return String(iso).slice(0, 10); }
function weekKey(iso){
  const d = new Date(iso);
  const firstDay = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d - firstDay) / DAY_MS);
  const week = Math.ceil((days + firstDay.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function monthKey(iso){ return String(iso).slice(0, 7); }

function inRange(iso, from, to){
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + DAY_MS) return false;
  return true;
}

function matchesFilters(ev, filters, productsById){
  if (filters.from || filters.to){
    if (!inRange(ev.createdAt, filters.from, filters.to)) return false;
  }
  if (filters.deviceType && ev.deviceType !== filters.deviceType) return false;
  if (filters.userSegment && ev.userSegment !== filters.userSegment) return false;
  if (filters.location && (ev.location || "Unknown") !== filters.location) return false;
  if (filters.category){
    const cat = ev.category || (ev.productId && productsById.get(ev.productId) && productsById.get(ev.productId).category);
    if (cat !== filters.category) return false;
  }
  if (filters.brand){
    const brand = ev.brand || (ev.productId && productsById.get(ev.productId) && productsById.get(ev.productId).brand);
    if ((brand || "").toLowerCase() !== filters.brand.toLowerCase()) return false;
  }
  return true;
}

function groupCount(events, keyFn){
  const map = new Map();
  for (const ev of events){
    const k = keyFn(ev);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

function buildFunnel(events){
  return {
    searches: events.filter(e => e.type === "search").length,
    clicks: events.filter(e => e.type === "product_click" || e.type === "suggest_click").length,
    addToCart: events.filter(e => e.type === "add_to_cart").length,
    purchases: events.filter(e => e.type === "purchase").length,
  };
}

function ratePct(numerator, denominator){
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal place
}

function buildTrend(events, bucket){
  const keyFn = bucket === "weekly" ? weekKey : bucket === "monthly" ? monthKey : dayKey;
  const searches = groupCount(events.filter(e => e.type === "search"), e => keyFn(e.createdAt));
  const clicks = groupCount(events.filter(e => e.type === "product_click" || e.type === "suggest_click"), e => keyFn(e.createdAt));
  const purchases = groupCount(events.filter(e => e.type === "purchase"), e => keyFn(e.createdAt));

  const allKeys = new Set([...searches.keys(), ...clicks.keys(), ...purchases.keys()]);
  return Array.from(allKeys).sort().map(key => {
    const s = searches.get(key) || 0;
    const c = clicks.get(key) || 0;
    const p = purchases.get(key) || 0;
    return { period: key, searches: s, clicks: c, purchases: p, ctr: ratePct(c, s), conversionRate: ratePct(p, s) };
  });
}

function buildZeroResultSearches(events, avgOrderValue){
  const zero = events.filter(e => e.type === "search" && e.resultCount === 0);
  const counts = groupCount(zero, e => e.query);
  return Array.from(counts.entries())
    .map(([query, count]) => ({ query, count, estimatedLostRevenue: Math.round(count * avgOrderValue) }))
    .sort((a, b) => b.count - a.count);
}

function buildRevenue(events, productsById){
  const purchases = events.filter(e => e.type === "purchase");
  const total = purchases.reduce((sum, e) => sum + (e.revenue || 0), 0);

  const byCategory = new Map();
  const byProduct = new Map();
  for (const e of purchases){
    const cat = e.category || (productsById.get(e.productId) && productsById.get(e.productId).category) || "unknown";
    byCategory.set(cat, (byCategory.get(cat) || 0) + (e.revenue || 0));
    if (e.productId) byProduct.set(e.productId, (byProduct.get(e.productId) || 0) + (e.revenue || 0));
  }

  const trend = groupCount(purchases, e => dayKey(e.createdAt));
  const trendRevenue = new Map();
  for (const e of purchases) trendRevenue.set(dayKey(e.createdAt), (trendRevenue.get(dayKey(e.createdAt)) || 0) + (e.revenue || 0));

  return {
    total: Math.round(total),
    byCategory: Array.from(byCategory.entries()).map(([category, revenue]) => ({ category, revenue: Math.round(revenue) })).sort((a, b) => b.revenue - a.revenue),
    byProduct: Array.from(byProduct.entries()).map(([productId, revenue]) => ({
      productId, revenue: Math.round(revenue),
      name: (productsById.get(productId) && productsById.get(productId).name) || productId,
    })).sort((a, b) => b.revenue - a.revenue),
    trend: Array.from(trendRevenue.entries()).map(([date, revenue]) => ({ date, revenue: Math.round(revenue) })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function buildMostSearchedProducts(events, productsById, limit){
  const stats = new Map();
  const get = (id) => {
    if (!stats.has(id)) stats.set(id, { productId: id, searchVolume: 0, clicks: 0, addToCarts: 0, purchases: 0, revenue: 0 });
    return stats.get(id);
  };
  for (const e of events){
    if (!e.productId) continue;
    const s = get(e.productId);
    if (e.type === "impression") s.searchVolume++;
    else if (e.type === "product_click" || e.type === "suggest_click") s.clicks++;
    else if (e.type === "add_to_cart") s.addToCarts++;
    else if (e.type === "purchase"){ s.purchases++; s.revenue += e.revenue || 0; }
  }
  return Array.from(stats.values())
    .map(s => ({ ...s, name: (productsById.get(s.productId) && productsById.get(s.productId).name) || s.productId, revenue: Math.round(s.revenue) }))
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, limit);
}

function buildInsights(events, productsById, funnel){
  const insights = [];
  const searchEvents = events.filter(e => e.type === "search");
  const queryCounts = groupCount(searchEvents, e => e.query);
  const topQueries = Array.from(queryCounts.entries()).sort((a, b) => b[1] - a[1]);

  if (topQueries.length){
    const [topQuery, volume] = topQueries[0];
    const queryEvents = events.filter(e => e.query === topQuery);
    const searches = queryEvents.filter(e => e.type === "search").length;
    const purchases = queryEvents.filter(e => e.type === "purchase");
    const revenue = purchases.reduce((s, e) => s + (e.revenue || 0), 0);
    const conv = ratePct(purchases.length, searches);
    insights.push(
      `"${topQuery}" generated ${volume} search${volume === 1 ? "" : "es"} this period` +
      (searches ? ` with a ${conv}% conversion rate` : "") +
      (revenue ? ` and ₹${revenue.toLocaleString("en-IN")} in revenue.` : ".")
    );
  }

  // Highest / lowest converting terms (min 3 searches to avoid noise on tiny samples).
  const convByQuery = topQueries
    .filter(([, vol]) => vol >= 3)
    .map(([q, vol]) => {
      const qEvents = events.filter(e => e.query === q);
      const purchases = qEvents.filter(e => e.type === "purchase").length;
      return { query: q, volume: vol, conversionRate: ratePct(purchases, vol) };
    });
  if (convByQuery.length){
    const best = [...convByQuery].sort((a, b) => b.conversionRate - a.conversionRate)[0];
    const worst = [...convByQuery].sort((a, b) => a.conversionRate - b.conversionRate)[0];
    if (best.conversionRate > 0) insights.push(`Highest converting search term: "${best.query}" at ${best.conversionRate}% conversion (${best.volume} searches).`);
    if (worst.query !== best.query) insights.push(`Lowest converting search term: "${worst.query}" at ${worst.conversionRate}% conversion (${worst.volume} searches) — worth a merchandising look.`);
  }

  // Searches with no inventory: zero-result terms, or terms whose top clicked product is out of stock.
  const zeroResultTerms = new Set(searchEvents.filter(e => e.resultCount === 0).map(e => e.query));
  if (zeroResultTerms.size){
    insights.push(`${zeroResultTerms.size} search term${zeroResultTerms.size === 1 ? "" : "s"} returned zero results (e.g. "${Array.from(zeroResultTerms)[0]}") — a synonym mapping or new SKU could recover this demand.`);
  }

  // High abandonment: clicked but never added to cart, min 3 clicks.
  const clicksByQuery = groupCount(events.filter(e => e.type === "product_click" || e.type === "suggest_click"), e => e.query);
  const addsByQuery = groupCount(events.filter(e => e.type === "add_to_cart"), e => e.query);
  const abandoned = Array.from(clicksByQuery.entries())
    .filter(([q, c]) => c >= 3 && !(addsByQuery.get(q) > 0))
    .sort((a, b) => b[1] - a[1]);
  if (abandoned.length){
    insights.push(`"${abandoned[0][0]}" has ${abandoned[0][1]} product clicks but no add-to-cart activity — a high-abandonment term worth investigating.`);
  }

  // Emerging trends: products whose clicks in the last 7 days exceed the prior 7 days.
  const now = Date.now();
  const last7 = events.filter(e => e.productId && (e.type === "product_click" || e.type === "suggest_click") && now - new Date(e.createdAt).getTime() <= 7 * DAY_MS);
  const prev7 = events.filter(e => e.productId && (e.type === "product_click" || e.type === "suggest_click") && now - new Date(e.createdAt).getTime() > 7 * DAY_MS && now - new Date(e.createdAt).getTime() <= 14 * DAY_MS);
  const last7ByProduct = groupCount(last7, e => e.productId);
  const prev7ByProduct = groupCount(prev7, e => e.productId);
  let emerging = null;
  for (const [pid, count] of last7ByProduct.entries()){
    const prior = prev7ByProduct.get(pid) || 0;
    if (count >= 3 && count > prior && (!emerging || count - prior > emerging.delta)){
      emerging = { pid, count, delta: count - prior };
    }
  }
  if (emerging){
    const name = (productsById.get(emerging.pid) && productsById.get(emerging.pid).name) || emerging.pid;
    insights.push(`"${name}" is trending up — ${emerging.count} clicks in the last 7 days vs ${emerging.count - emerging.delta} the week before.`);
  }

  return insights;
}

/** Main entry point: computes every metric the Search Analytics dashboard needs. */
function computeAnalytics(db, filters = {}){
  const productsById = new Map(db.products.map(p => [p.id, p]));
  const events = db.searchEvents.filter(e => matchesFilters(e, filters, productsById));

  const purchases = events.filter(e => e.type === "purchase");
  const avgOrderValue = purchases.length
    ? purchases.reduce((s, e) => s + (e.revenue || 0), 0) / purchases.length
    : 0;

  const funnel = buildFunnel(events);

  return {
    funnel,
    ctr: { overall: ratePct(funnel.clicks, funnel.searches) },
    conversionRate: { overall: ratePct(funnel.purchases, funnel.searches) },
    trends: {
      daily: buildTrend(events, "daily"),
      weekly: buildTrend(events, "weekly"),
      monthly: buildTrend(events, "monthly"),
    },
    zeroResultSearches: buildZeroResultSearches(events, avgOrderValue),
    revenue: buildRevenue(events, productsById),
    mostSearched: {
      top10: buildMostSearchedProducts(events, productsById, 10),
      top50: buildMostSearchedProducts(events, productsById, 50),
      top100: buildMostSearchedProducts(events, productsById, 100),
    },
    insights: buildInsights(events, productsById, funnel),
    totalEvents: events.length,
  };
}

module.exports = { computeAnalytics, ratePct };
