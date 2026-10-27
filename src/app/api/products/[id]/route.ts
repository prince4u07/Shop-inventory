import { NextResponse } from "next/server";
import { AuthError, requireOwner, requireUser } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { productUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

// GET /api/products/:id — any authenticated user (POS lookup needs this).
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return authErrorResponse(e);
  }
  const { id } = await params;

  const { data, error } = await getServiceSupabase()
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product: data });
}

// PATCH /api/products/:id — owner only. Barcode is immutable (it's the
// variant identity + scanner key); quantity edits here are manual corrections,
// normal stock movement happens via sales/returns/audits.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    await requireOwner();
  } catch (e) {
    return authErrorResponse(e);
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = productUpdateSchema.safeParse({ ...((body as object) ?? {}), id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { id: _ignored, ...updates } = parsed.data;
  void _ignored;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await getServiceSupabase()
    .from("products")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product: data });
}

// DELETE /api/products/:id — owner only. SOFT delete (is_active = false) so
// sales history keeps its FK. Hard delete is blocked when sales exist
// (DB RESTRICT); use ?hard=true only for never-sold mistakes.
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    await requireOwner();
  } catch (e) {
    return authErrorResponse(e);
  }
  const { id } = await params;
  const hard = new URL(request.url).searchParams.get("hard") === "true";
  const supabase = getServiceSupabase();

  if (hard) {
    const { data: sales } = await supabase
      .from("sales")
      .select("id")
      .eq("product_id", id)
      .limit(1);
    if (sales && sales.length > 0) {
      return NextResponse.json(
        { error: "Product has sales history — deactivate instead" },
        { status: 409 }
      );
    }
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, hard: true });
  }

  const { data, error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product: data });
}
