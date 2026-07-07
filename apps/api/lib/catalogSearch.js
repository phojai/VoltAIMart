/* ============================================================
   VoltAIMart — shared catalog search/filter logic.
   Used by both the public products API and the AI chat's
   search_catalog tool, so "live search" always reflects the
   same current inventory the storefront shows.
   ============================================================ */

function searchCatalog(db, { q, department, category } = {}){
  let list = db.products.slice();

  if (department){
    list = list.filter(p => p.department === department);
  }
  if (category){
    list = list.filter(p => p.category === category);
  }
  if (q){
    const query = String(q).toLowerCase().trim();
    // Query words, used for keyword matching below — word-level, not raw
    // substring, so a short keyword like "phone" can't match merely because
    // it happens to appear inside an unrelated word (e.g. "head-PHONE-s").
    const queryWords = query.split(/\W+/).filter(Boolean);
    // Category ids are single fixed words (e.g. "headphones"), so match them
    // the same word-bounded way as keywords — a plain .includes(query) here
    // has the identical "phone"-inside-"headphones" collision, just in the
    // opposite direction (a "phone" query would then match the "headphones"
    // category).
    const categoryMatches = cat => {
      const c = cat.toLowerCase();
      return queryWords.some(w => w === c || w.startsWith(c) || c.startsWith(w));
    };
    list = list.filter(p =>
      p.name.toLowerCase().includes(query) ||
      categoryMatches(p.category) ||
      (p.tagline || "").toLowerCase().includes(query) ||
      (p.keywords || []).some(k => {
        const kw = k.toLowerCase();
        return queryWords.some(w => w === kw || w.startsWith(kw) || kw.startsWith(w));
      })
    );
  }
  return list;
}

module.exports = { searchCatalog };
