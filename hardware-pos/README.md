# ShopSphere &mdash; Price &amp; Inventory Management

A working full-stack slice covering the two modules you specified:

1. **Daily Price Management** &mdash; owner-only price edits, full price history, prices that
   update live everywhere without ever touching old invoices.
2. **Inventory Transaction History** &mdash; every stock movement recorded as an immutable
   transaction, a searchable Inventory Ledger, and a set of stock reports.

Billing (a minimal "New Bill" screen) and login are included as the supporting plumbing
those two modules need to be demonstrated end-to-end.

## Stack

- **Backend:** Node.js + Express + Node's built-in `node:sqlite` module (no native
  compilation step, no external DB server to install &mdash; the whole database is one file,
  `backend/store.db`, created automatically on first run).
- **Frontend:** React + Vite, plain CSS (no UI framework), talks to the backend over `/api`.

> Requires **Node.js 22.5+** (tested on 22.22) because of `node:sqlite`. Run `node -v` to check.
> If you're on an older Node, the easiest fix is to swap `db.js` to `better-sqlite3` instead
> (same API, just needs a native build step) &mdash; see the comment at the top of `backend/db.js`.

## Running it

```bash
# Terminal 1 - backend (http://localhost:4000)
cd backend
npm install
npm start

# Terminal 2 - frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Demo logins (seeded automatically):

| Username | Password   | Role    | Can edit prices? |
|----------|-----------|---------|-------------------|
| owner    | owner123  | Owner   | Yes |
| worker1  | worker123 | Worker 1| No (view only) |
| worker2  | worker123 | Worker 2| No (view only) |

The backend seeds 4 sample products with opening stock on first run so you have something
to click around immediately.

## Where each requirement lives

### Price Management
- Fields on every product (purchase, selling, market, dealer, last/previous selling price,
  last updated date/by): `backend/db.js` (`products` table), edited via
  `PUT /api/products/:id/price` in `backend/routes/products.js`.
- Owner-only enforcement: `requireOwner` middleware (`backend/middleware/auth.js`), applied
  to that route; the frontend also hides the edit form for non-owners
  (`frontend/src/pages/ProductDetail.jsx`).
- Instant, permanent, app-wide effect: the update is a single SQL `UPDATE`, so the very next
  `GET /api/products` (fired on every page load / refresh) returns the new price. There's no
  cache to invalidate.
- Old invoices never change: `POST /api/invoices` copies `current_selling_price` into
  `invoice_items.selling_price` at the moment of sale (`backend/routes/invoices.js`). That
  column is never touched again, no matter how many times the product's price changes later.
- Price history: every change writes a row to `price_history` with old/new price, old/new
  market price, who, when, and an optional reason. Viewable per-product, newest first, on the
  product detail page.

### Inventory Transaction History
- Every stock change of any kind funnels through one place:
  `POST /api/inventory/transactions` (`backend/routes/inventory.js`), or the equivalent logic
  inlined in `POST /api/invoices` for sales. Both write a row to `inventory_transactions` with
  previous stock, new stock, type, quantity, user, remarks, and (where relevant) supplier /
  invoice number &mdash; and both update `products.current_stock` in the same DB transaction, so
  the two can never drift apart.
- Supported transaction types are enforced with a `CHECK` constraint in SQLite and mirrored in
  the API's validation list, exactly as specified (New Stock Purchase, Sale, Customer Return,
  Supplier Return, Manual Stock Adjustment, Damaged Item, Lost Item, Stock Correction, Opening
  Stock Entry).
- Per-product timeline: `GET /api/products/:id/inventory-timeline`, rendered on the product
  detail page.
- Inventory Ledger (search/filter by product, type, date range, user, supplier, invoice
  number): `GET /api/inventory/transactions` with query params, rendered on the Ledger page.
- Reports (daily/monthly movement, damaged items, manual adjustments, stock value, added vs
  sold, fast/slow moving): `backend/routes/reports.js`, rendered on the Reports page as tabs.

## Known simplifications (flagged deliberately, not hidden)

These are the corners cut to keep this a reviewable first pass rather than a production system:

- **Auth is intentionally minimal.** Passwords are stored in plaintext and the "token" is just
  a base64 tag, not a signed JWT. Fine for local use/demo; swap in `bcrypt` + real JWTs (or a
  session store) before putting this anywhere near the internet.
- **No pagination** on the ledger or product list yet &mdash; fine at hundreds of rows, will need
  it at tens of thousands.
- **Single-currency, no tax/GST calculation** on bills &mdash; add if your invoices need it.
- **No unit tests** &mdash; I did run the whole flow manually end-to-end (login, price update,
  billing against the old vs. new price, damaged-item adjustment, ledger filters, every report)
  during development to confirm the logic holds up; formal tests would be a good next step.

## Suggested next steps

- Add supplier/customer master tables instead of free-text fields.
- Add printable invoice PDFs (there's a `pdf` skill available if you want this built next).
- Role-based visibility on the Reports/Ledger pages if Worker 1/2 shouldn't see cost prices.
- Bring in Excel export for the reports, since hardware store owners often want that for
  their accountant.
