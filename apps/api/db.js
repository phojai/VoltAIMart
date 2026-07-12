/* ============================================================
   VoltAIMart — tiny JSON-blob datastore (users, products, orders,
   settings all in one object). Storage backend is pluggable — see
   server/store.js: a local file by default, or Upstash Redis on
   Vercel (where the filesystem can't be written to). readDB/writeDB
   are async so either backend works behind the same interface.
   ============================================================ */
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const { DEPARTMENTS, CATEGORIES, PRODUCTS } = require("./seedData");
const store = require("./store");

function defaultSettings(){
  return {
    // --- VoltAI Assistant (floating chat FAB) — unchanged, do not repurpose these fields. ---
    llmProvider: "anthropic", // "anthropic" | "openai" | "gemini"
    models: {
      anthropic: "claude-sonnet-5",
      openai: "gpt-4o-mini",
      gemini: "gemini-2.0-flash",
    },
    apiKeys: { anthropic: "", openai: "", gemini: "" },
    webSearch: { provider: "tavily", apiKey: "" },

    // --- Voice AI agent (hero search mic) ---
    vapi: {
      agentMode: "simulated", // "simulated" (free, browser-based, hardcoded intents) | "vapi" (live AI voice agent)
      mode: "assistantId", // "assistantId" | "inline" — only used when agentMode is "vapi"
      publicKey: "",
      assistantId: "",
      inline: {
        firstMessage: "Hi, I'm VoltAI. Ask me to find products, check prices, or anything else.",
        systemPrompt: "You are VoltAI, a friendly voice shopping assistant for VoltAIMart, an electronics & fashion storefront. Keep replies short and conversational.",
        modelProvider: "openai",
        modelName: "gpt-4o",
        voiceProvider: "",
        voiceId: "",
      },
    },

    updatedAt: new Date().toISOString(),
  };
}

function seedInitialData(){
  const now = new Date().toISOString();
  const users = [
    {
      id: nanoid(10),
      name: "Prasenjit Admin",
      email: "prasenjit@voltmart.com",
      passwordHash: bcrypt.hashSync("admin123", 10),
      role: "admin",
      createdAt: now,
    },
    {
      id: nanoid(10),
      name: "Alex Agent",
      email: "agent@voltaimart.com",
      passwordHash: bcrypt.hashSync("agent123", 10),
      role: "agent",
      createdAt: now,
    },
    {
      id: nanoid(10),
      name: "Casey Customer",
      email: "customer@voltaimart.com",
      passwordHash: bcrypt.hashSync("customer123", 10),
      role: "customer",
      createdAt: now,
    },
  ];

  // Attach department to each seeded product (denormalized for convenience).
  const catDept = Object.fromEntries(CATEGORIES.map(c => [c.id, c.department]));
  const products = PRODUCTS.map(p => ({
    ...p,
    department: catDept[p.category] || "electronics",
    stock: p.stock != null ? p.stock : 25,
    reviewCount: 0,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    users,
    products,
    orders: [],
    reviews: [],
    wishlists: {},
    notifications: [],
    departments: DEPARTMENTS,
    categories: CATEGORIES,
    settings: defaultSettings(),
  };
}

async function readDB(){
  let data = await store.get();
  if (!data){
    data = seedInitialData();
    await store.set(data);
  }
  // Migration: older db.json files (from before AI chat existed) won't have settings.
  if (!data.settings){
    data.settings = defaultSettings();
    await writeDB(data);
  } else if (!data.settings.vapi){
    // Migration: db.json created before the Vapi voice agent existed.
    data.settings.vapi = defaultSettings().vapi;
    await writeDB(data);
  } else if (!data.settings.vapi.agentMode){
    // Migration: db.json created before the simulated/Vapi mode toggle existed.
    // Default to "vapi" here (not "simulated") so installs that already had a
    // working Vapi key keep behaving exactly as before after this update.
    data.settings.vapi.agentMode = data.settings.vapi.publicKey ? "vapi" : "simulated";
    await writeDB(data);
  }

  // Migration: reviews, wishlists, and per-product stock/reviewCount didn't
  // exist before this update — backfill so older db.json files keep working.
  let dirty = false;
  if (!data.reviews){ data.reviews = []; dirty = true; }
  if (!data.wishlists){ data.wishlists = {}; dirty = true; }
  if (data.products.some(p => p.stock == null || p.reviewCount == null)){
    data.products.forEach(p => {
      if (p.stock == null) p.stock = 25;       // sensible non-zero default for pre-existing demo data
      if (p.reviewCount == null) p.reviewCount = 0;
    });
    dirty = true;
  }
  // Migration: notifications (simulated emails) and per-user address books.
  if (!data.notifications){ data.notifications = []; dirty = true; }
  if (data.users.some(u => !Array.isArray(u.addresses))){
    data.users.forEach(u => { if (!Array.isArray(u.addresses)) u.addresses = []; });
    dirty = true;
  }
  if (dirty) await writeDB(data);

  return data;
}

async function writeDB(data){
  await store.set(data);
}

async function resetDB(){
  const data = seedInitialData();
  await store.set(data);
  return readDB();
}

module.exports = { readDB, writeDB, resetDB, DB_PATH: store.DB_PATH };
