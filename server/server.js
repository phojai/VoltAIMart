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

const app = express();
const PORT = process.env.PORT || 4000;
const ROOT = path.join(__dirname, "..");

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

app.get("/api/health", (req, res) => res.json({ ok: true, service: "voltaimart-api" }));

// Serve the storefront + back-office frontend as static files.
app.use(express.static(ROOT));

app.use((req, res) => {
  if (req.path.startsWith("/api/")){
    return res.status(404).json({ error: "Not found." });
  }
  res.status(404).sendFile(path.join(ROOT, "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  VoltAIMart server running at http://localhost:${PORT}\n`);
  console.log("  Demo accounts:");
  console.log("    Admin:    admin@voltaimart.com    / admin123");
  console.log("    Agent:    agent@voltaimart.com    / agent123");
  console.log("    Customer: customer@voltaimart.com / customer123\n");
});
