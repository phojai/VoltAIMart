# VoltAIMart

Electronics & fashion storefront with an AI chat assistant, plus a real Express backend for authentication, a product catalog, and orders.

## Running it

Requires [Node.js](https://nodejs.org) 18+ installed on your machine.

```bash
npm install
npm start
```

Then open **http://localhost:4000** in your browser.

The server serves both the frontend pages and the `/api/*` backend from the same origin, so there's nothing else to configure.

## AI Chat assistant

The floating chat button (bottom-right on the storefront) talks to `POST /api/chat`, which runs a tool-calling
loop against whichever LLM an admin has configured:

1. Log in as `admin@voltaimart.com` and open **Dashboard → AI Settings**.
2. Pick a provider (Anthropic/Claude, OpenAI, or Google/Gemini) and paste its API key. Keys are stored in
   `server/data/db.json` — fine for a demo, use a real secrets manager before production.
3. Optionally add a [Tavily](https://tavily.com) API key to enable live web search for questions beyond the
   catalog (reviews, comparisons, general facts).

Until a key is configured, the assistant replies with a message telling the visitor AI chat isn't set up yet
instead of failing silently. The assistant always calls a `search_catalog` tool before naming a specific
product/price, so answers reflect live inventory rather than the model's guesses.

## Demo accounts

| Role     | Email                     | Password      | Lands on         |
|----------|---------------------------|---------------|------------------|
| Admin    | admin@voltaimart.com      | admin123      | `dashboard.html` |
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
- Storage defaults to a single JSON file (`server/data/db.json`) locally — see "Deploying to Vercel" below for the swap needed to persist data on serverless hosting
- No email verification / password reset flow
- No file uploads for product images — products use an emoji as their "icon"

## Project layout

```
electrostore/
├── server/                  Express backend
│   ├── server.js            entry point — serves public/ + mounts /api routes
│   ├── db.js                datastore interface (reads/writes one JSON blob via store.js)
│   ├── store.js             storage backend: local server/data/db.json, or Upstash Redis on Vercel
│   ├── seedData.js          loads the initial catalog from public/js/products-data.js
│   ├── middleware/auth.js   JWT verification + role guards
│   ├── lib/catalogSearch.js shared product search/filter (used by /api/products and the chat tool)
│   ├── lib/llm.js           tool-calling loop for Claude / OpenAI / Gemini
│   └── routes/              auth, products, orders, users, meta, chat, settings
└── public/                  everything served to the browser (must stay under public/ — see below)
    ├── index.html / products.html / product.html / cart.html   storefront
    ├── login.html                                               login + sign up
    ├── dashboard.html                                           admin/agent back office (+ AI Settings tab)
    ├── account.html                                              customer order history
    ├── js/
    │   ├── api.js         shared fetch client (auth headers, token storage, helpers)
    │   ├── catalog.js      loads live product data from the API for the storefront
    │   ├── app.js          cart (localStorage), nav, hamburger drawer
    │   ├── aichat.js        AI chat FAB + panel (calls /api/chat)
    │   ├── voice.js        unused legacy voice assistant, superseded by aichat.js
    │   ├── dashboard.js     admin/agent dashboard logic
    │   └── account.js       customer account page logic
    └── css/style.css
```

## Resetting the demo data

To wipe the datastore back to the original 3 users / 24 products / 0 orders:

```bash
node -e "require('./server/db').resetDB().then(() => console.log('reset done'))"
```

## Deploying to Vercel

This app runs as a normal Express server locally, but Vercel deploys it as a serverless Function, which changes two things:

1. **Static files must live under `public/`.** Vercel serves anything in `public/**` directly from its CDN and ignores `express.static()` entirely — this repo is already laid out that way (see above), so nothing to change here as long as new pages/assets are added inside `public/`.
2. **The filesystem is read-only** (only `/tmp` is writable, and it's wiped between invocations). `server/data/db.json` can't be used as real storage there, so `server/store.js` automatically switches to **Upstash Redis** whenever `KV_REST_API_URL` / `KV_REST_API_TOKEN` are present in the environment — no code changes needed, just connect a database:

   - In the Vercel dashboard, open your project → **Storage** tab → **Create Database** → **Upstash** (free tier: 256MB, 500K commands/month) → connect it to this project.
   - Vercel automatically injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` into the project's environment — redeploy so the Function picks them up.
   - Without a connected database, the app still deploys and reads/browses fine, but any write (sign-up, checkout, saving AI Settings / API keys, editing a product) will silently fail to persist between requests.

Locally, none of this matters — `npm start` always uses the `server/data/db.json` file since those env vars won't be set on your machine.
