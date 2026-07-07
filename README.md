# VoltAIMart

Electronics & fashion storefront with an AI chat assistant, plus a real Express backend for authentication, a product catalog, and orders.

Monorepo layout (npm workspaces): a static frontend in `apps/web` and an Express backend in `apps/api`, wired up for both plain local `node` and a Vercel serverless deploy. See "Project layout" below.

## Running it

Requires [Node.js](https://nodejs.org) 18+ installed on your machine.

```bash
npm install
npm start
```

Then open **http://localhost:4000** in your browser.

The server serves both the frontend pages (from `apps/web`) and the `/api/*` backend from the same origin, so there's nothing else to configure. Optional env vars are documented in `.env.example` — every one has a working dev-only default, so this works with zero configuration.

## AI Chat assistant

The floating chat button (bottom-right on the storefront) talks to `POST /api/chat`, which runs a tool-calling
loop against whichever LLM an admin has configured:

1. Log in as `prasenjit@voltmart.com` and open **Dashboard → AI Settings**.
2. Pick a provider (Anthropic/Claude, OpenAI, or Google/Gemini) and paste its API key. Keys are stored (encrypted at rest) in
   `apps/api/data/db.json` — fine for a demo, use a real secrets manager before production.
3. Optionally add a [Tavily](https://tavily.com) API key to enable live web search for questions beyond the
   catalog (reviews, comparisons, general facts).

Until a key is configured, the assistant replies with a message telling the visitor AI chat isn't set up yet
instead of failing silently. The assistant always calls a `search_catalog` tool before naming a specific
product/price, so answers reflect live inventory rather than the model's guesses.

## Demo accounts

| Role     | Email                     | Password      | Lands on         |
|----------|---------------------------|---------------|------------------|
| Admin    | prasenjit@voltmart.com    | admin123      | `dashboard.html` |
| Agent    | agent@voltaimart.com      | agent123      | `dashboard.html` |
| Customer | customer@voltaimart.com   | customer123   | `account.html`   |

You can also sign up a brand-new customer account from the login page — new accounts are always created with the "Customer" role. Click any demo account card on the login page to autofill the form.

## What's real vs. what's a stub

**Real:**
- Password auth with bcrypt-hashed passwords and JWTs (7-day expiry, stored in `localStorage`)
- Role-based access control enforced server-side (admin / agent / customer), not just hidden in the UI
- Product catalog stored server-side; adding/editing/deleting a product in the dashboard immediately shows up on the storefront for every visitor
- Orders are created server-side from the actual cart contents (server recomputes prices — never trusts client-submitted totals) and persisted
- Customers only ever see their own orders; admin/agent see all orders and can update order status; only admin can change a user's role

**Stub / out of scope for a prototype:**
- No real payment processing — "Checkout" creates an order record but doesn't charge a card
- Storage defaults to a single JSON file (`apps/api/data/db.json`) locally — see "Deploying to Vercel" below for the swap needed to persist data on serverless hosting
- No email verification / password reset flow
- No file uploads for product images — products use an emoji as their "icon"

## Project layout

This is an npm-workspaces monorepo: a static frontend (`apps/web`) and an
Express backend (`apps/api`), plus a thin root `api/` shim so Vercel can run
the backend as a serverless function.

```
electrostore/
├── api/
│   └── index.js              Vercel serverless function entry — just re-exports apps/api/server.js
├── vercel.json                outputDirectory: apps/web (static, CDN-served) + rewrites /api/* -> the function above
├── package.json                workspace root (workspaces: ["apps/api"]); npm start/dev delegate here
├── apps/
│   ├── api/                   Express backend — its own package (@voltaimart/api)
│   │   ├── package.json
│   │   ├── server.js           builds + exports the Express app; calls app.listen() only when run directly (local dev)
│   │   ├── db.js               datastore interface (reads/writes one JSON blob via store.js)
│   │   ├── store.js            storage backend: local apps/api/data/db.json, or Upstash Redis on Vercel
│   │   ├── seedData.js         loads the initial catalog from apps/web/js/products-data.js
│   │   ├── middleware/auth.js  JWT verification + role guards
│   │   ├── lib/catalogSearch.js shared product search/filter (used by /api/products and the chat tool)
│   │   ├── lib/llm.js          tool-calling loop for Claude / OpenAI / Gemini
│   │   └── routes/             auth, products, orders, users, meta, chat, settings, voice-agent
│   └── web/                    everything served to the browser (must stay under apps/web — see below)
│       ├── index.html / products.html / product.html / cart.html   storefront
│       ├── login.html                                               login + sign up
│       ├── dashboard.html                                           admin/agent back office (+ AI Settings tab)
│       ├── account.html                                              customer order history
│       ├── js/
│       │   ├── api.js          shared fetch client (auth headers, token storage, helpers)
│       │   ├── catalog.js       loads live product data from the API for the storefront
│       │   ├── app.js           cart (localStorage), nav, hamburger drawer
│       │   ├── aichat.js        AI chat FAB + panel (calls /api/chat)
│       │   ├── voice.js         unused legacy voice assistant, superseded by aichat.js
│       │   ├── dashboard.js     admin/agent dashboard logic
│       │   └── account.js       customer account page logic
│       └── css/style.css
```

Locally, `apps/api/server.js` serves both `/api/*` and the static files in
`apps/web` itself (one process, `npm start`). On Vercel those two things
split: `apps/web` is deployed as the static Output Directory and served
straight from Vercel's CDN, while `apps/api/server.js` runs as the `/api/*`
serverless function via the `api/index.js` shim — see "Deploying to Vercel"
below.

## Resetting the demo data

To wipe the datastore back to the original 3 users / 24 products / 0 orders:

```bash
node -e "require('./apps/api/db').resetDB().then(() => console.log('reset done'))"
```

## Deploying to Vercel

Import this repo in Vercel as-is — `vercel.json` and `api/index.js` already do the necessary wiring, no build command needed. Two things behave differently there than locally:

1. **Static files are served from `apps/web` by Vercel's CDN, not Express.** `vercel.json` sets `"outputDirectory": "apps/web"`, so anything added under `apps/web/**` is deployed as a static asset automatically — keep new pages/assets there. The `rewrites` rule sends every `/api/*` request to the `api/index.js` function instead (which just re-exports the same Express app from `apps/api/server.js`, so all existing routes work unmodified).
2. **The filesystem is read-only** (only `/tmp` is writable, and it's wiped between invocations). `apps/api/data/db.json` can't be used as real storage there, so `apps/api/store.js` automatically switches to **Upstash Redis** whenever `KV_REST_API_URL` / `KV_REST_API_TOKEN` are present in the environment — no code changes needed, just connect a database:

   - In the Vercel dashboard, open your project → **Storage** tab → **Create Database** → **Upstash** (free tier: 256MB, 500K commands/month) → connect it to this project.
   - Vercel automatically injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` into the project's environment — redeploy so the Function picks them up.
   - Without a connected database, the app still deploys and reads/browses fine, but any write (sign-up, checkout, saving AI Settings / API keys, editing a product) will silently fail to persist between requests.

Also set real values for `JWT_SECRET` and `ENCRYPTION_KEY` in the Vercel project's environment variables before going to production — see `.env.example`; the fallbacks baked into the code are dev-only.

Locally, none of this matters — `npm start` always uses the `apps/api/data/db.json` file since those env vars won't be set on your machine.
