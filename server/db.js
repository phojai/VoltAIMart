/* ============================================================
   VoltAIMart — tiny JSON-file datastore.
   No external DB required: everything persists to
   server/data/db.json. Fine for a prototype / demo backend;
   swap for a real database before going to production.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const { DEPARTMENTS, CATEGORIES, PRODUCTS } = require("./seedData");

const DB_PATH = path.join(__dirname, "data", "db.json");

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

    // --- Voice AI agent (hero search mic, powered by Vapi) ---
    vapi: {
      mode: "assistantId", // "assistantId" | "inline"
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
      name: "Ava Admin",
      email: "admin@voltaimart.com",
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
    createdAt: now,
    updatedAt: now,
  }));

  return {
    users,
    products,
    orders: [],
    departments: DEPARTMENTS,
    categories: CATEGORIES,
    settings: defaultSettings(),
  };
}

function ensureDbFile(){
  if (!fs.existsSync(DB_PATH)){
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(seedInitialData(), null, 2));
  }
}

function readDB(){
  ensureDbFile();
  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  // Migration: older db.json files (from before AI chat existed) won't have settings.
  if (!data.settings){
    data.settings = defaultSettings();
    writeDB(data);
  } else if (!data.settings.vapi){
    // Migration: db.json created before the Vapi voice agent existed.
    data.settings.vapi = defaultSettings().vapi;
    writeDB(data);
  }
  return data;
}

function writeDB(data){
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function resetDB(){
  fs.writeFileSync(DB_PATH, JSON.stringify(seedInitialData(), null, 2));
  return readDB();
}

module.exports = { readDB, writeDB, resetDB, DB_PATH };
