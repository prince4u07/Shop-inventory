import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase";
import { ProductForm } from "@/components/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let product = null;
  try {
    const { data } = await getServiceSupabase()
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    product = data;
  } catch {
    product = null;
  }

  if (!product) notFound();

  return (
    <main>
      <h1 className="text-xl font-semibold">Edit product</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Barcode is locked — it&apos;s the variant identity and scanner key.
      </p>
      <div className="mt-4">
        <ProductForm mode="edit" initial={product} />
      </div>
    </main>
  );
}
