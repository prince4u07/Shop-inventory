import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import type { Product } from "@/lib/database.types";
import { ProductRowActions } from "@/components/product-row-actions";

type Search = {
  q?: string;
  category?: string;
  gender?: string;
  active?: string;
  low_stock?: string;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const filters = await searchParams;
  const q = filters.q?.trim() ?? "";
  const category = filters.category ?? "";
  const gender = filters.gender ?? "";
  const active = filters.active ?? "";
  const lowStockOnly = filters.low_stock === "true";

  let rows: Product[] = [];
  let setupNeeded = false;

  try {
    const supabase = getServiceSupabase();
    let query = supabase
      .from("products")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (q) query = query.or(`name.ilike.%${q}%,barcode.eq.${q}`);
    if (category) query = query.eq("category", category);
    if (gender) query = query.eq("gender", gender);
    if (active === "true") query = query.eq("is_active", true);
    if (active === "false") query = query.eq("is_active", false);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows = data ?? [];
    if (lowStockOnly) {
      rows = rows.filter((p) => p.quantity <= p.low_stock_threshold);
    }
  } catch {
    setupNeeded = true;
  }

  if (setupNeeded) {
    return (
      <main>
        <h1 className="text-xl font-semibold">Products</h1>
        <p className="mt-4 rounded-xl bg-white p-6 text-sm ring-1 ring-zinc-200">
          Supabase isn&apos;t configured yet. Copy{" "}
          <code className="rounded bg-zinc-100 px-1">.env.example</code> to{" "}
          <code className="rounded bg-zinc-100 px-1">.env.local</code>, add your
          project keys, and run the SQL in{" "}
          <code className="rounded bg-zinc-100 px-1">
            supabase/migrations/0001_initial_schema.sql
          </code>
          .
        </p>
      </main>
    );
  }

  return (
    <main>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products ({rows.length})</h1>
        <Link
          href="/admin/products/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          + New product
        </Link>
      </div>

      <form method="get" className="mt-4 flex flex-wrap gap-2 text-sm">
        <input
          name="q"
          placeholder="Search name or barcode"
          defaultValue={q}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 outline-none focus:border-zinc-900"
        />
        <select name="category" defaultValue={category} className="rounded-lg border border-zinc-300 px-2 py-1.5">
          <option value="">All categories</option>
          <option value="clothing">Clothing</option>
          <option value="footwear">Footwear</option>
          <option value="accessories">Accessories</option>
        </select>
        <select name="gender" defaultValue={gender} className="rounded-lg border border-zinc-300 px-2 py-1.5">
          <option value="">All genders</option>
          <option value="men">Men</option>
          <option value="women">Women</option>
          <option value="unisex">Unisex</option>
        </select>
        <select name="active" defaultValue={active} className="rounded-lg border border-zinc-300 px-2 py-1.5">
          <option value="">Active + hidden</option>
          <option value="true">Active only</option>
          <option value="false">Hidden only</option>
        </select>
        <label className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1.5">
          <input type="checkbox" name="low_stock" value="true" defaultChecked={lowStockOnly} />
          Low stock
        </label>
        <button className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100">
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2">Name / Barcode</th>
              <th className="px-4 py-2">Variant</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Stock</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const low = p.quantity <= p.low_stock_threshold;
              return (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-zinc-500">{p.barcode}</div>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {p.category} · {p.gender} · {p.size} · {p.color}
                  </td>
                  <td className="px-4 py-2">₹{Number(p.price).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    {p.quantity}
                    {low && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        low
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {p.is_active ? "Active" : "Hidden"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/products/${p.id}/edit`}
                        className="rounded-lg border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                      >
                        Edit
                      </Link>
                      <ProductRowActions id={p.id} isActive={p.is_active} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No products match. Create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
