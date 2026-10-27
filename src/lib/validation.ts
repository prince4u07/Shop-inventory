import { z } from "zod";

// ── Shared primitives ──────────────────────────────────────────────
const barcodeSchema = z
  .string()
  .min(1, "Barcode is required")
  .max(64)
  // Most symbologies (EAN-13, Code128, QR payloads) are alphanumerics + -_.
  .regex(/^[A-Za-z0-9\-_.]+$/, "Invalid barcode characters");

const priceSchema = z
  .number({ invalid_type_error: "Price must be a number" })
  .min(0, "Price cannot be negative")
  .max(99999999.99);

// ── Products ───────────────────────────────────────────────────────
export const productCategorySchema = z.enum([
  "clothing",
  "footwear",
  "accessories",
]);
export const productGenderSchema = z.enum(["men", "women", "unisex"]);

export const productInsertSchema = z.object({
  name: z.string().min(1).max(200),
  category: productCategorySchema,
  gender: productGenderSchema,
  size: z.string().min(1).max(20),
  color: z.string().min(1).max(50),
  price: priceSchema,
  quantity: z.number().int().min(0).default(0),
  barcode: barcodeSchema,
  image_url: z.string().url().nullable().optional(),
  low_stock_threshold: z.number().int().min(0).default(5),
  is_active: z.boolean().default(true),
});

export const productUpdateSchema = productInsertSchema
  .partial()
  .omit({ barcode: true })
  .extend({ id: z.string().uuid() });

// ── Sales ──────────────────────────────────────────────────────────
// One entry per cart line; the API groups lines by transaction_id.
export const saleLineSchema = z.object({
  product_id: z.string().uuid(),
  quantity_sold: z.number().int().min(1, "Quantity must be at least 1"),
  sale_price: priceSchema,
});

export const completeSaleSchema = z.object({
  transaction_id: z.string().uuid().optional(),
  source: z.enum(["online", "in-store"]).default("in-store"),
  staff_id: z.string().uuid().nullable().optional(),
  lines: z.array(saleLineSchema).min(1, "Sale needs at least one item"),
});

export const returnSaleSchema = z.object({
  sale_id: z.string().uuid(),
});

// ── Users ──────────────────────────────────────────────────────────
export const userCreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    phone: z.string().min(7).max(20).nullable().optional(),
    email: z.string().email().nullable().optional(),
    password: z.string().min(8, "Password must be 8+ characters"),
    role: z.enum(["owner", "staff"]).default("staff"),
  })
  .refine((v) => v.phone || v.email, {
    message: "Provide at least a phone or an email",
    path: ["email"],
  });

export type ProductInsertInput = z.infer<typeof productInsertSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type CompleteSaleInput = z.infer<typeof completeSaleSchema>;
