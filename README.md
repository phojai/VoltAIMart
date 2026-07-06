# VoltAIMart

Electronics & fashion storefront with voice search, plus a real Express backend for authentication, a product catalog, and orders.

## Running it

Requires [Node.js](https://nodejs.org) 18+ installed on your machine.

```bash
npm install
npm start
```

Then open **http://localhost:4000** in your browser (Chrome or Edge recommended — voice search uses the Web Speech API, which Safari/Firefox don't support).

The server serves both the frontend pages and the `/api/*` backend from the same origin, so there's nothing else to configure.

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
- Storage is a single JSON file (`server/data/db.json`), not a production database — fine for a demo, swap for Postgres/etc. before going live
- No email verification / password reset flow
- No file uploads for product images — products use an emoji as their "icon"

## Project layout

```
electrostore/
├── server/                  Express backend
│   ├── server.js            entry point — serves the frontend + mounts /api routes
│   ├── db.js                tiny JSON-file datastore (reads/writes server/data/db.json)
│   ├── seedData.js          loads the initial catalog from js/products-data.js
│   ├── middleware/auth.js   JWT verification + role guards
│   └── routes/              auth, products, orders, users, meta
├── index.html / products.html / product.html / cart.html   storefront
├── login.html                                               login + sign up
├── dashboard.html                                           admin/agent back office
├── account.html                                              customer order history
├── js/
│   ├── api.js         shared fetch client (auth headers, token storage, helpers)
│   ├── catalog.js      loads live product data from the API for the storefront
│   ├── app.js          cart (localStorage), nav, hamburger drawer
│   ├── voice.js        voice search (Web Speech API)
│   ├── dashboard.js     admin/agent dashboard logic
│   └── account.js       customer account page logic
└── css/style.css
```

## Resetting the demo data

The database is a plain JSON file at `server/data/db.json`. To wipe it back to the original 3 users / 24 products / 0 orders:

```bash
node -e "require('./server/db').resetDB()"
```
