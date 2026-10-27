# Clothing & Footwear Shop — Inventory & Sales Management

Full-stack inventory & POS system for a single-shop clothing/footwear retailer.
Stock is **never edited manually** — it moves only through sales, returns and
audited stock adjustments, enforced by PostgreSQL triggers.

## Stack

| Layer | Tech |
| --- | --- |
| Database | PostgreSQL (17+) with triggers/check constraints |
| Backend | Node.js + Express, Prisma ORM |
| Frontend | React (Vite) + Tailwind CSS + Recharts |

## Business rules (enforced in the database)

- `AFTER INSERT ON sales_transactions` → decrements `inventory.current_stock`
- `AFTER INSERT ON returns` → increments stock **only when `resellable = true`**
- `BEFORE INSERT ON sales_transactions` → blocks the sale when `qty_sold >
  current_stock` (row-locked, so concurrent sales can't oversell)
- `BEFORE INSERT ON returns` → product must belong to the original sale and
  total returns can never exceed `qty_sold`
- `BEFORE INSERT ON stock_adjustments` → applies signed `qty_changed`,
  rejects negative results, records the post-adjustment stock (audit ledger)
- Any *direct* `UPDATE inventory.current_stock` outside those flows is rejected
  by a guard trigger (`app.stock_op` session context)
- Every sale/return is wrapped in a transaction (`prisma.$transaction` with a
  `SELECT … FOR UPDATE` row lock) → atomic, no race conditions

## Project layout

```
backend/          Express API (port 4000)
  prisma/schema.prisma
  prisma/migrations/20260101000000_init/migration.sql   (+ all triggers)
  prisma/seed.js   demo catalogue, opening stock, 10 days of sales
  src/routes/      inventory | sales | returns | dashboard | insights | reports
  test/            DB trigger tests + API integration tests
frontend/         Vite React app (port 5173, proxies /api → :4000)
  src/pages/       Inventory | Sale | Return | Dashboard | Restock | Reports
```

## Prerequisites

- Node.js 18+
- PostgreSQL 17 running locally with superuser `postgres` / password `postgres`
  (or set `DATABASE_URL` to any Postgres instance)

## Setup

```powershell
# 1. Backend: create DB, apply migration (tables + triggers), seed demo data
cd backend
npm install
npm run db:create        # CREATE DATABASE shopdb
npm run db:migrate       # prisma generate + migrate deploy
npm run seed             # optional demo data (safe to skip for real use)

# 2. Frontend
cd ../frontend
npm install
```

## Run

```powershell
# terminal 1 – API on http://localhost:4000
cd backend
npm run dev

# terminal 2 – UI on http://localhost:5173
cd frontend
npm run dev
```

## Tests

```powershell
cd backend
npm test          # DB trigger checks + API integration checks + adversarial suite (198 cases)
```

The third suite (`test/adversarial.js`) is a reverse/QA battery: positive smoke, invalid-type
matrix, SQL-injection payloads on every endpoint (incl. `pg_sleep` timing check), CSV
formula-injection, fuzzing (malformed JSON, oversized bodies, NaN/Infinity), and concurrency
races (20 parallel sales vs stock=10, 6 parallel returns vs a 3-unit sale). It asserts the
backend never returns a 5xx and cleans up every product it creates (SKU prefix `ADVS-`).
Note: the first two suites leave test rows behind — run
`npx prisma migrate reset --force --skip-generate; node prisma/seed.js`
afterwards for a clean demo state.

### Verify triggers by hand

```sql
-- these should all fail (DB-level enforcement):
UPDATE inventory SET current_stock = 999 WHERE sku = 'SKU-CLT-001';   -- guard trigger
INSERT INTO sales_transactions (product_id, qty_sold, selling_price, payment_mode)
  VALUES (1, 99999, 100, 'Cash');                                    -- insufficient stock
```

## Screens

| Route | What it does |
| --- | --- |
| `/inventory` | Products table, filters (category/brand/size/status), summary cards, add/edit, audited stock-in |
| `/sale` | Autocomplete product search → qty, discount, payment mode; client-side stock guard before the DB constraint |
| `/return` | Find a sale by ID or by date, choose qty + reason + resellable toggle |
| `/dashboard` | Daily aggregates (units, revenue, returns value, net sales, best seller) + 7-day trend chart |
| `/restock` | Fast-movers (sell-through over 7/30 days) + reorder suggestions `(avg_daily_sales × lead_time) + safety_stock − current_stock` |
| `/reports` | Export inventory.csv and daily sales.csv |

## Notes

- Money is `NUMERIC(12,2)`; all aggregates computed in SQL.
- Calendar-day filtering passes `'YYYY-MM-DD'` text to Postgres with `::date`
  casts to avoid JS/PG timezone drift (see `backend/src/lib/dates.js`).
- CSV exports include a BOM so Excel opens them with UTF-8 by default.
