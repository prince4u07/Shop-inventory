import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireOwner, requireUser } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { productInsertSchema } from "@/lib/validation";

function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

// GET /api/products?q=&category=&gender=&active=&low_stock=&page=&limit=
// Any authenticated user (owner + staff) — staff need read access for the
// Step-3 POS lookup. Public storefront gets its own route in Step 5.
export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return authErrorResponse(e);
  }

  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const category = params.get("category");
  const gender = params.get("gender");
  const active = params.get("active"); // "true" | "false" | null
  const lowStock = params.get("low_stock") === "true";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? "50") || 50));

  const supabase = getServiceSupabase();
  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (q) query = query.or(`name.ilike.%${q}%,barcode.eq.${q}`);
  if (category) query = query.eq("category", category);
  if (gender) query = query.eq("gender", gender);
  if (active === "true") query = query.eq("is_active", true);
  if (active === "false") query = query.eq("is_active", false);
  // Supabase can't compare two columns server-side; filter low-stock client-side
  // only when the page is small, else use a generous quantity ceiling.
  if (lowStock) query = query.lte("quantity", 10);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = lowStock
    ? (data ?? []).filter((p) => p.quantity <= p.low_stock_threshold)
    : (data ?? []);

  return NextResponse.json({ products: rows, total: count ?? rows.length, page, limit });
}

// POST /api/products — owner only.
export async function POST(request: Request) {
  try {
    await requireOwner();
  } catch (e) {
    return authErrorResponse(e);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = productInsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("products")
    .insert({
      ...parsed.data,
      quantity: parsed.data.quantity ?? 0,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500; // unique barcode
    const message =
      error.code === "23505" ? "Barcode already exists" : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
