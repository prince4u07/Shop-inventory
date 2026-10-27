import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-2xl font-semibold">Family Shop Inventory</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Menswear · Womenswear · Footwear · Accessories
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/login"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Staff / Owner login
          </Link>
          <span className="text-xs text-zinc-400">
            Customer storefront arrives in Step 5
          </span>
        </div>
      </div>
    </main>
  );
}
