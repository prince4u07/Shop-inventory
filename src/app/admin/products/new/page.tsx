import { ProductForm } from "@/components/product-form";

export default function NewProductPage() {
  return (
    <main>
      <h1 className="text-xl font-semibold">New product</h1>
      <p className="mt-1 text-sm text-zinc-500">
        One row per variant — same shirt in M/White and L/White are two barcodes.
      </p>
      <div className="mt-4">
        <ProductForm mode="create" />
      </div>
    </main>
  );
}
