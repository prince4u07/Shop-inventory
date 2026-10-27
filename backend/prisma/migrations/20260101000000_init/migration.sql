-- Clock: keep timestamps timezone-aware at the DB-driven level
-- Tables are created with Prisma's expected definitions.

CREATE TABLE "inventory" (
    "product_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sub_category" TEXT,
    "brand" TEXT,
    "size" TEXT,
    "color" TEXT,
    "cost_price" DECIMAL(12,2) NOT NULL,
    "selling_price" DECIMAL(12,2) NOT NULL,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "reorder_threshold" INTEGER NOT NULL DEFAULT 3,
    "supplier" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "inventory_sku_key" UNIQUE ("sku"),
    CONSTRAINT "inventory_category_check" CHECK ("category" IN ('Clothing', 'Footwear')),
    CONSTRAINT "inventory_selling_price_check" CHECK ("selling_price" >= 0),
    CONSTRAINT "inventory_cost_price_check" CHECK ("cost_price" >= 0),
    CONSTRAINT "inventory_current_stock_check" CHECK ("current_stock" >= 0),
    CONSTRAINT "inventory_reorder_threshold_check" CHECK ("reorder_threshold" >= 0)
);

CREATE TABLE "sales_transactions" (
    "sale_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty_sold" INTEGER NOT NULL,
    "selling_price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_mode" TEXT NOT NULL,
    "sale_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "sale_time" TIME(6) NOT NULL DEFAULT CURRENT_TIME,

    CONSTRAINT "sales_transactions_pkey" PRIMARY KEY ("sale_id"),
    CONSTRAINT "sales_transactions_qty_sold_check" CHECK ("qty_sold" > 0),
    CONSTRAINT "sales_transactions_discount_check" CHECK ("discount" >= 0),
    CONSTRAINT "sales_transactions_discount_gross_check" CHECK ("discount" <= "qty_sold" * "selling_price"),
    CONSTRAINT "sales_transactions_payment_mode_check" CHECK ("payment_mode" IN ('Cash', 'UPI', 'Card')),
    CONSTRAINT "sales_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "returns" (
    "return_id" SERIAL NOT NULL,
    "original_sale_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty_returned" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "resellable" BOOLEAN NOT NULL,
    "return_date" DATE NOT NULL DEFAULT CURRENT_DATE,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("return_id"),
    CONSTRAINT "returns_qty_returned_check" CHECK ("qty_returned" > 0),
    CONSTRAINT "returns_reason_check" CHECK ("reason" IN ('damaged', 'wrong_size', 'other')),
    CONSTRAINT "returns_original_sale_id_fkey" FOREIGN KEY ("original_sale_id") REFERENCES "sales_transactions"("sale_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "returns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "stock_adjustments" (
    "adjustment_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty_changed" INTEGER NOT NULL,
    "adjusted_stock" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "created_by" TEXT NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("adjustment_id"),
    CONSTRAINT "stock_adjustments_qty_changed_check" CHECK ("qty_changed" <> 0),
    CONSTRAINT "stock_adjustments_reason_check" CHECK ("reason" IN ('stock_in', 'correction')),
    CONSTRAINT "stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------------
-- Business-logic functions & triggers (AFTER/BETWEEN, DB-level enforcement)
-- ---------------------------------------------------------------------------

-- 1) Guard: inventory.current_stock may only change through the dedicated
--    business flows (sale, return, stock adjustment). Any direct UPDATE
--    outside those contexts (e.g. a plain UPDATE ... SET current_stock)
--    is rejected, so stock is never edited manually.
CREATE OR REPLACE FUNCTION trg_inventory_stock_guard() RETURNS trigger AS $$
BEGIN
    IF (OLD.current_stock IS DISTINCT FROM NEW.current_stock)
        AND BTRIM(COALESCE(current_setting('app.stock_op', true), ''), ' ') = '' THEN
        RAISE EXCEPTION 'Direct edits to inventory.current_stock are not allowed; stock changes must flow through sales, returns or the stock_adjustments ledger'
            USING ERRCODE = '25001';
    END IF;

    -- keep last_updated in sync automatically when stock actually changes
    IF (OLD.current_stock IS DISTINCT FROM NEW.current_stock) THEN
        NEW.last_updated := CURRENT_TIMESTAMP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_stock_guard
    BEFORE UPDATE ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION trg_inventory_stock_guard();

-- 2) BEFORE INSERT on sales_transactions: block the insert if qty_sold >
--    current_stock. Puts a row lock on the inventory row (SELECT ... FOR
--    UPDATE) so concurrent sales for the same product are serialized —
--    no race conditions, no overselling.
CREATE OR REPLACE FUNCTION trg_sale_check_stock() RETURNS trigger AS $$
DECLARE
    v_stock INTEGER;
BEGIN
    SELECT i.current_stock INTO v_stock
      FROM inventory i
     WHERE i.product_id = NEW.product_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist', NEW.product_id
            USING ERRCODE = '23503';
    END IF;

    IF NEW.qty_sold > v_stock THEN
        RAISE EXCEPTION 'Insufficient stock: requested %, available % (product %)', NEW.qty_sold, v_stock, NEW.product_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sale_check_stock
    BEFORE INSERT ON sales_transactions
    FOR EACH ROW
    EXECUTE FUNCTION trg_sale_check_stock();

-- 3) AFTER INSERT on sales_transactions: decrement inventory.current_stock
--    by qty_sold automatically.
CREATE OR REPLACE FUNCTION trg_sale_decrement_stock() RETURNS trigger AS $$
BEGIN
    PERFORM set_config('app.stock_op', 'sale', true);
    UPDATE inventory
       SET current_stock = current_stock - NEW.qty_sold
     WHERE product_id = NEW.product_id;
    PERFORM set_config('app.stock_op', '', true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sale_decrement_stock
    AFTER INSERT ON sales_transactions
    FOR EACH ROW
    EXECUTE FUNCTION trg_sale_decrement_stock();

-- 4) BEFORE INSERT on returns: the product must belong to the original sale
--    and total returned units may never exceed qty_sold. Rows the prior
--    transaction committed are visible because the sale row was locked.
CREATE OR REPLACE FUNCTION trg_return_validate() RETURNS trigger AS $$
DECLARE
    v_qty_sold INTEGER;
    v_product_id INTEGER;
    v_already_returned INTEGER;
BEGIN
    SELECT s.qty_sold, s.product_id
      INTO v_qty_sold, v_product_id
      FROM sales_transactions s
     WHERE s.sale_id = NEW.original_sale_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original sale % does not exist', NEW.original_sale_id
            USING ERRCODE = '23503';
    END IF;

    IF NEW.product_id <> v_product_id THEN
        RAISE EXCEPTION 'Product % does not belong to sale %', NEW.product_id, NEW.original_sale_id
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(r.qty_returned), 0)
      INTO v_already_returned
      FROM returns r
     WHERE r.original_sale_id = NEW.original_sale_id;

    IF v_already_returned + NEW.qty_returned > v_qty_sold THEN
        RAISE EXCEPTION 'Cannot return % units: sale % had % units sold, % already returned', NEW.qty_returned, NEW.original_sale_id, v_qty_sold, v_already_returned
            USING ERRCODE = '23514';
    END IF;

    -- business integrity: a damaged unit can never re-enter sellable stock
    IF NEW.reason = 'damaged' AND NEW.resellable THEN
        RAISE EXCEPTION 'Damaged returns cannot be resellable'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER return_validate
    BEFORE INSERT ON returns
    FOR EACH ROW
    EXECUTE FUNCTION trg_return_validate();

-- 5) AFTER INSERT on returns: increment inventory.current_stock by
--    qty_returned, only when resellable = true.
CREATE OR REPLACE FUNCTION trg_return_increment_stock() RETURNS trigger AS $$
BEGIN
    IF NEW.resellable THEN
        PERFORM set_config('app.stock_op', 'return', true);
        UPDATE inventory
           SET current_stock = current_stock + NEW.qty_returned
         WHERE product_id = NEW.product_id;
        PERFORM set_config('app.stock_op', '', true);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER return_increment_stock
    AFTER INSERT ON returns
    FOR EACH ROW
    EXECUTE FUNCTION trg_return_increment_stock();

-- 6) BEFORE INSERT on stock_adjustments: applies the signed qty_changed to
--    current_stock (stock-in or manual correction) and records the resulting
--    stock level for audit. Rejects adjustments that would push stock below 0.
CREATE OR REPLACE FUNCTION trg_adjustment_apply() RETURNS trigger AS $$
DECLARE
    v_stock INTEGER;
BEGIN
    SELECT i.current_stock INTO v_stock
      FROM inventory i
     WHERE i.product_id = NEW.product_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist', NEW.product_id
            USING ERRCODE = '23503';
    END IF;

    IF v_stock + NEW.qty_changed < 0 THEN
        RAISE EXCEPTION 'Adjustment would leave negative stock: current %, change %', v_stock, NEW.qty_changed
            USING ERRCODE = '23514';
    END IF;

    PERFORM set_config('app.stock_op', 'adjustment', true);
    UPDATE inventory
       SET current_stock = current_stock + NEW.qty_changed
     WHERE product_id = NEW.product_id;
    PERFORM set_config('app.stock_op', '', true);

    NEW.adjusted_stock := v_stock + NEW.qty_changed;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER adjustment_apply
    BEFORE INSERT ON stock_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION trg_adjustment_apply();

-- Indexes
CREATE INDEX "inventory_category_idx" ON "inventory"("category", "sub_category");
CREATE INDEX "inventory_brand_idx" ON "inventory"("brand");
CREATE INDEX "inventory_name_idx" ON "inventory"("name");
CREATE INDEX "sales_transactions_product_id_idx" ON "sales_transactions"("product_id");
CREATE INDEX "sales_transactions_sale_date_idx" ON "sales_transactions"("sale_date");
CREATE INDEX "returns_product_id_idx" ON "returns"("product_id");
CREATE INDEX "returns_original_sale_id_idx" ON "returns"("original_sale_id");
CREATE INDEX "stock_adjustments_product_id_idx" ON "stock_adjustments"("product_id");
