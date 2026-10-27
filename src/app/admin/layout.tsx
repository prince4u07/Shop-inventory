import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin/products");
  if (session.role !== "owner") redirect("/pos");

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4 text-sm">
            <span className="font-semibold">Shop Admin</span>
            <Link href="/admin/products" className="hover:underline">
              Products
            </Link>
            <span className="text-zinc-400">Sales · Staff · Reports (next steps)</span>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-500">{session.name} (owner)</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
