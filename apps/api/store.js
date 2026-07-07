/* ============================================================
   VoltAIMart — pluggable storage backend for the whole app's data
   (one JSON blob: users, products, orders, settings).

   - Locally (or any host with a normal writable disk): falls back
     to a plain file at apps/api/data/db.json. Zero setup.
   - On Vercel: the deployed filesystem is read-only (only /tmp is
     writable, and it's wiped between invocations/instances), so a
     file on disk can't be used as real storage there. If Upstash
     Redis is connected via the Vercel Marketplace (Storage tab →
     Create Database → Upstash), Vercel injects KV_REST_API_URL /
     KV_REST_API_TOKEN — when present, this module talks to that
     instead, so writes (orders, settings, API keys, etc.) actually
     persist. See: https://vercel.com/docs/redis
   ============================================================ */
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");
const KEY = "voltaimart:db";

const useKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

let redis = null;
function getRedis(){
  if (!redis){
    // Lazily required so local dev (file-backed) never needs this package installed.
    const { Redis } = require("@upstash/redis");
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return redis;
}

async function get(){
  if (useKV){
    const raw = await getRedis().get(KEY);
    if (raw == null) return null;
    // @upstash/redis may hand back an already-parsed object or a raw string
    // depending on version/content — handle both defensively.
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }
  if (!fs.existsSync(DB_PATH)) return null;
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

async function set(value){
  if (useKV){
    await getRedis().set(KEY, JSON.stringify(value));
    return;
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(value, null, 2));
}

module.exports = { get, set, useKV, DB_PATH };
