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

   get()/set() are wrapped so they can never hang and never throw —
   a slow/unreachable Redis instance (paused DB, stale credentials,
   network issue) used to make every request that touches the
   datastore hang forever with no response at all, taking down the
   whole app silently. Now a timeout/error just logs and falls back
   (get() -> null, so the caller re-seeds a fresh default catalog;
   set() -> a skipped write) — matching what this file already
   claimed happens without a connected database, but actually true.
   ============================================================ */
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");
const KEY = "voltaimart:db";
const IO_TIMEOUT_MS = 5000;

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

function withTimeout(promise, label){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${IO_TIMEOUT_MS}ms`)), IO_TIMEOUT_MS)),
  ]);
}

async function get(){
  if (useKV){
    try {
      const raw = await withTimeout(getRedis().get(KEY), "Upstash read");
      if (raw == null) return null;
      // @upstash/redis may hand back an already-parsed object or a raw string
      // depending on version/content — handle both defensively.
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e){
      console.error("Upstash Redis read failed — serving a fresh default catalog for this request:", e.message);
      return null;
    }
  }
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (e){
    console.error("Local db.json read failed — serving a fresh default catalog for this request:", e.message);
    return null;
  }
}

async function set(value){
  if (useKV){
    try {
      await withTimeout(getRedis().set(KEY, JSON.stringify(value)), "Upstash write");
    } catch (e){
      console.error("Upstash Redis write failed — this change will not persist:", e.message);
    }
    return;
  }
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(value, null, 2));
  } catch (e){
    console.error("Local db.json write failed (e.g. read-only filesystem) — this change will not persist:", e.message);
  }
}

module.exports = { get, set, useKV, DB_PATH };
