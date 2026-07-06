/* ============================================================
   VoltAIMart — live product catalog.
   Replaces the old static array: fetches departments,
   categories, and products from the Express backend
   (/api/meta, /api/products) so that products added via the
   admin dashboard immediately show up on the storefront.

   Dispatches a "catalog:ready" event on `document` once loaded;
   pages that render products should wait for that event.
   ============================================================ */

let DEPARTMENTS = [];
let CATEGORIES = [];
let PRODUCTS = [];

function getCategoriesByDepartment(deptId){
  return CATEGORIES.filter(c => c.department === deptId);
}
function getDepartmentById(id){
  return DEPARTMENTS.find(d => d.id === id);
}
function getProductById(id){
  return PRODUCTS.find(p => p.id === id);
}
function getProductsByCategory(cat){
  return PRODUCTS.filter(p => p.category === cat);
}
function searchProducts(query){
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return PRODUCTS.filter(p => {
    return p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.tagline || "").toLowerCase().includes(q) ||
      (p.keywords || []).some(k => q.includes(k) || k.includes(q));
  });
}

async function loadCatalog(){
  try {
    const [meta, products] = await Promise.all([
      fetch("/api/meta").then(r => r.json()),
      fetch("/api/products").then(r => r.json()),
    ]);
    DEPARTMENTS = meta.departments || [];
    CATEGORIES = meta.categories || [];
    PRODUCTS = products.products || [];
  } catch (e){
    console.error("Failed to load catalog from API", e);
    DEPARTMENTS = []; CATEGORIES = []; PRODUCTS = [];
  }
  document.dispatchEvent(new CustomEvent("catalog:ready"));
}

loadCatalog();
