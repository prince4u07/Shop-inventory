-- Shop Inventory — initial schema (Step 1)
-- Target: PostgreSQL via Supabase
-- Apply: Supabase Dashboard > SQL Editor > paste & run,
--        or: supabase db push (if Supabase CLI linked)
--
-- Design notes:
--  * products.barcode is UNIQUE and identifies ONE exact variant
--    (size+color), never a category. Scanner input joins on this column.
--  * sales is one row PER PRODUCT LINE, grouped by transaction_id so a
--    multi-item cart ("Complete Sale") stays traceable as one transaction.
--  * Stock is ONLY mutated at "Complete Sale" time (Step 3) inside a
--    transaction that locks product rows (SELECT ... FOR UPDATE) and checks
--    quantity >= 0. Never decrement per scan.
--  * Returns never DELETE: they flip sales.status to 'returned', set
--    return_date, and add quantity back. Exchanges = return + new sale.
--  * products.is_active lets owners hide items from the storefront without
--    deleting (deleting would break the sales FK history).

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ── updated_at helper ──────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users ──────────────────────────────────────────────────────────
create table public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  phone text unique,
  email text unique check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_contact_check check (phone is not null or email is not null)
);

-- ── products ───────────────────────────────────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  category text not null check (category in ('clothing', 'footwear', 'accessories')),
  gender text not null check (gender in ('men', 'women', 'unisex')),
  size text not null check (char_length(size) between 1 and 20),
  color text not null check (char_length(color) between 1 and 50),
  price numeric(10, 2) not null check (price >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  barcode text not null unique check (char_length(barcode) between 1 and 64),
  image_url text,
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_idx on public.products (category);
create index products_gender_idx on public.products (gender);
create index products_category_gender_idx on public.products (category, gender);
-- Low-stock alert query: where quantity <= low_stock_threshold and is_active
create index products_low_stock_idx on public.products (quantity);

-- ── sales (one row per product line) ───────────────────────────────
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  -- Groups all lines created by a single "Complete Sale" tap / one checkout.
  transaction_id uuid not null default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  quantity_sold integer not null check (quantity_sold > 0),
  -- Snapshot of products.price at sale time (price edits must not rewrite history).
  sale_price numeric(10, 2) not null check (sale_price >= 0),
  date_time timestamptz not null default now(),
  source text not null check (source in ('online', 'in-store')),
  status text not null default 'completed' check (status in ('completed', 'returned')),
  return_date timestamptz,
  -- Nullable: online sales have no staff member.
  staff_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sales_return_date_check check (
    (status = 'completed' and return_date is null)
    or
    (status = 'returned' and return_date is not null and return_date >= date_time)
  )
);

create index sales_transaction_idx on public.sales (transaction_id);
create index sales_product_idx on public.sales (product_id);
create index sales_staff_idx on public.sales (staff_id);
create index sales_date_idx on public.sales (date_time desc);
create index sales_status_idx on public.sales (status);
create index sales_source_idx on public.sales (source);
-- Reporting hot path: date range + status filter ("units sold" excludes returned)
create index sales_date_status_idx on public.sales (date_time desc, status);

-- ── stock_audits (shelf-count vs system-stock reconciliation, Step 7) ─
create table public.stock_audits (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  system_qty integer not null check (system_qty >= 0),
  counted_qty integer not null check (counted_qty >= 0),
  -- Generated style: stored explicitly so reports don't recompute.
  difference integer not null,
  staff_id uuid references public.users (id) on delete set null,
  notes text,
  audited_at timestamptz not null default now(),
  constraint stock_audits_difference_check check (difference = counted_qty - system_qty)
);

create index stock_audits_product_idx on public.stock_audits (product_id);
create index stock_audits_date_idx on public.stock_audits (audited_at desc);

-- ── updated_at triggers ────────────────────────────────────────────
create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

create trigger products_updated_at
  before update on public.products
  for each row execute function public.handle_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────
-- API routes use the SERVICE_ROLE key server-side (bypasses RLS).
-- Browser clients must never touch these tables directly with the anon key.
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.stock_audits enable row level security;

-- No public policies = anon key gets zero access by default. Intentional.
-- When Supabase Auth is wired up (Step 2), add policies such as:
--   create policy "staff read products" on public.products
--     for select to authenticated using (true);
