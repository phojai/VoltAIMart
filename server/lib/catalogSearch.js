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
    list = list.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      (p.tagline || "").toLowerCase().includes(query) ||
      (p.keywords || []).some(k => query.includes(k) || k.includes(query))
    );
  }
  return list;
}

module.exports = { searchCatalog };
