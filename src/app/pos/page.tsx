import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/pos");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Record a Sale</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">
            {session.name} ({session.role})
          </span>
          <LogoutButton />
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-white p-6 text-sm text-zinc-600 ring-1 ring-zinc-200">
        Barcode scan-to-cart lives here — coming in Step 3. Staff can only use
        this screen: no price edits, no product deletes.
      </p>
    </main>
  );
}
