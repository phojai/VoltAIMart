/* ============================================================
   Vercel serverless function entry point.

   Vercel's zero-config Node runtime looks for functions under a
   top-level /api directory. The actual Express app (routes, auth,
   datastore, etc.) lives in apps/api as its own package — this file
   just re-exports that app so Vercel can invoke it as the handler
   for every /api/* request (see the rewrite in vercel.json; without
   it, only exactly "/api" would route here, not nested paths like
   "/api/products/123").

   Locally this file is never used — `npm start` / `npm run dev` run
   apps/api/server.js directly, which also calls app.listen(). Here,
   Vercel manages the actual listening; requiring the module for its
   exported `app` (a valid (req, res) handler) is all that's needed.
   ============================================================ */
module.exports = require("../apps/api/server");
