"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProductRowActions({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleActive() {
    setLoading(true);
    try {
      if (!isActive) {
        // Reactivate via PATCH.
        await fetch(`/api/products/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: true }),
        });
      } else {
        // Soft delete (deactivate) — sales history stays intact.
        await fetch(`/api/products/${id}`, { method: "DELETE" });
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggleActive}
      disabled={loading}
      className="rounded-lg border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
    >
      {loading ? "…" : isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}
