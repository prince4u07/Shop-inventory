// Database row types — mirrors supabase/migrations/0001_initial_schema.sql
// Keep this file as the single source of truth for Product / Sale / User shapes
// used by API routes, admin panel, POS cart, and storefront.

export type ProductCategory = "clothing" | "footwear" | "accessories";
export type ProductGender = "men" | "women" | "unisex";
export type UserRole = "owner" | "staff";
export type SaleSource = "online" | "in-store";
export type SaleStatus = "completed" | "returned";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  gender: ProductGender;
  /** Free-form: "M" / "L" / "UK 9" / "Free" — one row per size+color variant. */
  size: string;
  color: string;
  /** Current selling price (INR). History is snapshotted into sales.sale_price. */
  price: number;
  /** Current system stock. Only mutated at "Complete Sale" / return / audit. */
  quantity: number;
  /** UNIQUE, maps to exactly one variant row. Scanner joins on this column. */
  barcode: string;
  image_url: string | null;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ProductInsert = Omit<Product, "id" | "created_at" | "updated_at">;
export type ProductUpdate = Partial<Omit<ProductInsert, "barcode">> & {
  id: string;
};

export interface Sale {
  id: string;
  /** Groups every line created by one "Complete Sale" tap / one checkout. */
  transaction_id: string;
  product_id: string;
  quantity_sold: number;
  /** Price snapshot taken at sale time — immune to later price edits. */
  sale_price: number;
  date_time: string;
  source: SaleSource;
  status: SaleStatus;
  return_date: string | null;
  /** Null for online sales (no staff involved). */
  staff_id: string | null;
  created_at: string;
}

export type SaleInsert = Pick<
  Sale,
  "product_id" | "quantity_sold" | "sale_price" | "source" | "staff_id"
> & {
  transaction_id?: string;
};

export interface ShopUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** bcrypt hash — never sent to the client. */
  password_hash: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

/** Safe shape for client / session use (no password hash). */
export type PublicUser = Omit<ShopUser, "password_hash">;

export interface StockAudit {
  id: string;
  product_id: string;
  system_qty: number;
  counted_qty: number;
  difference: number;
  staff_id: string | null;
  notes: string | null;
  audited_at: string;
}

/** One scanner line in the in-memory POS cart (Step 3). Not a DB row yet. */
export interface CartLine {
  product: Product;
  quantity: number;
}
