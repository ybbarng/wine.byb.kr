import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminGuard } from "@/features/admin/admin-guard";
import { getWineOptions } from "@/features/cellar/queries";
import { TastingNoteForm } from "@/features/cellar/tasting-note-form";

export const metadata: Metadata = {
  title: "새 기록",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function NewTastingNotePage() {
  const wines = await getWineOptions();

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-24">
        <header className="mt-6">
          <h1 className="font-serif text-3xl tracking-tight text-foreground">새 기록</h1>
          <p className="mt-2 text-sm text-rose/60">마신 와인을 기록합니다.</p>
        </header>
        <AdminGuard>
          <TastingNoteForm wines={wines} />
        </AdminGuard>
      </main>
    </div>
  );
}
