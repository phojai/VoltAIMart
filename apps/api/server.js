const path = require("path");
const express = require("express");
const cors = require("cors");

const { attachUser } = require("./middleware/auth");
const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/products.routes");
const orderRoutes = require("./routes/orders.routes");
const userRoutes = require("./routes/users.routes");
const metaRoutes = require("./routes/meta.routes");
const chatRoutes = require("./routes/chat.routes");
const settingsRoutes = require("./routes/settings.routes");
const voiceAgentRoutes = require("./routes/voiceAgent.routes");

const app = express();
const PORT = process.env.PORT || 4000;
// Storefront + back-office frontend lives in the sibling apps/web package.
// Locally, Express serves it directly (below). On Vercel, this app runs as
// the /api/* serverless function (see root api/index.js + vercel.json) and
// apps/web is deployed as the static Output Directory, served straight from
// its CDN — express.static() below never runs for those paths there.
const PUBLIC_DIR = path.join(__dirname, "..", "web");

app.use(cors());
app.use(express.json());
app.use(attachUser);

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/users", userRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/voice-agent", voiceAgentRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, service: "voltaimart-api" }));

// Serve the storefront + back-office frontend as static files (local dev only
// — on Vercel this line never runs for these paths, its CDN intercepts them).
app.use(express.static(PUBLIC_DIR));

app.use((req, res) => {
  if (req.path.startsWith("/api/")){
    return res.status(404).json({ error: "Not found." });
  }
  res.status(404).sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Only start listening when this file is run directly (`node server.js` /
// `npm start`, both locally). When Vercel's serverless runtime instead
// requires this module (via the root api/index.js), it just wants the
// exported `app` request handler — it manages the actual listening itself.
if (require.main === module){
  app.listen(PORT, () => {
    console.log(`\n  VoltAIMart server running at http://localhost:${PORT}\n`);
    console.log("  Demo accounts:");
    console.log("    Admin:    prasenjit@voltmart.com  / admin123");
    console.log("    Agent:    agent@voltaimart.com    / agent123");
    console.log("    Customer: customer@voltaimart.com / customer123\n");
  });
}

module.exports = app;
