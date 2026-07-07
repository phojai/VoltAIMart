/* ============================================================
   Loads DEPARTMENTS / CATEGORIES / PRODUCTS from the single
   source of truth used by the browser (js/products-data.js),
   so the backend seed always matches the frontend catalog file.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const filePath = path.join(__dirname, "..", "public", "js", "products-data.js");
const code = fs.readFileSync(filePath, "utf8");
// Top-level `const`/`let` bindings aren't exposed as properties on the
// vm context object, so append explicit assignments in the SAME script
// so they share the same lexical scope as the declarations above.
const exposedCode = `${code}\nthis.DEPARTMENTS = DEPARTMENTS;\nthis.CATEGORIES = CATEGORIES;\nthis.PRODUCTS = PRODUCTS;\n`;
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(exposedCode, sandbox);

module.exports = {
  DEPARTMENTS: sandbox.DEPARTMENTS,
  CATEGORIES: sandbox.CATEGORIES,
  PRODUCTS: sandbox.PRODUCTS,
};
