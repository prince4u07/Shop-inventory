"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/database.types";

const inputCls =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";

export function ProductForm({
  initial,
  mode,
}: {
  initial?: Product;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get("name") ?? "").trim(),
      category: form.get("category"),
      gender: form.get("gender"),
      size: String(form.get("size") ?? "").trim(),
      color: String(form.get("color") ?? "").trim(),
      price: Number(form.get("price")),
      quantity: Number(form.get("quantity") ?? 0),
      low_stock_threshold: Number(form.get("low_stock_threshold") ?? 5),
      is_active: form.get("is_active") === "on",
    };
    const imageUrl = String(form.get("image_url") ?? "").trim();
    if (imageUrl) payload.image_url = imageUrl;
    if (mode === "create") {
      payload.barcode = String(form.get("barcode") ?? "").trim();
    }

    try {
      const res = await fetch(
        mode === "create" ? "/api/products" : `/api/products/${initial!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      router.push("/admin/products");
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid max-w-2xl grid-cols-1 gap-4 rounded-2xl bg-white p-6 ring-1 ring-zinc-200 sm:grid-cols-2"
    >
      <label className="text-sm font-medium sm:col-span-2">
        Name
        <input name="name" required maxLength={200} defaultValue={initial?.name} className={inputCls} />
      </label>

      <label className="text-sm font-medium">
        Category
        <select name="category" defaultValue={initial?.category ?? "clothing"} className={inputCls}>
          <option value="clothing">Clothing</option>
          <option value="footwear">Footwear</option>
          <option value="accessories">Accessories</option>
        </select>
      </label>

      <label className="text-sm font-medium">
        Gender
        <select name="gender" defaultValue={initial?.gender ?? "unisex"} className={inputCls}>
          <option value="men">Men</option>
          <option value="women">Women</option>
          <option value="unisex">Unisex</option>
        </select>
      </label>

      <label className="text-sm font-medium">
        Size (e.g. M, UK 9, Free)
        <input name="size" required maxLength={20} defaultValue={initial?.size} className={inputCls} />
      </label>

      <label className="text-sm font-medium">
        Color
        <input name="color" required maxLength={50} defaultValue={initial?.color} className={inputCls} />
      </label>

      <label className="text-sm font-medium">
        Price (₹)
        <input
          name="price"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={initial?.price}
          className={inputCls}
        />
      </label>

      <label className="text-sm font-medium">
        Stock quantity
        <input
          name="quantity"
          type="number"
          min="0"
          step="1"
          defaultValue={initial?.quantity ?? 0}
          className={inputCls}
        />
      </label>

      <label className="text-sm font-medium sm:col-span-2">
        Barcode (unique, one variant — {mode === "edit" ? "locked after creation" : "scan the label"})
        <input
          name="barcode"
          required={mode === "create"}
          disabled={mode === "edit"}
          maxLength={64}
          defaultValue={initial?.barcode}
          className={`${inputCls} disabled:bg-zinc-100`}
        />
      </label>

      <label className="text-sm font-medium sm:col-span-2">
        Image URL (optional)
        <input name="image_url" type="url" defaultValue={initial?.image_url ?? ""} className={inputCls} />
      </label>

      <label className="text-sm font-medium">
        Low-stock alert at
        <input
          name="low_stock_threshold"
          type="number"
          min="0"
          step="1"
          defaultValue={initial?.low_stock_threshold ?? 5}
          className={inputCls}
        />
      </label>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          name="is_active"
          type="checkbox"
          defaultChecked={initial?.is_active ?? true}
          className="h-4 w-4"
        />
        Visible in store
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
