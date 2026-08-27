import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminGuard } from "@/features/admin/admin-guard";
import { getWineOptions } from "@/features/journal/queries";
import { TastingNoteWizard } from "@/features/journal/tasting-note-wizard";

export const metadata: Metadata = {
  title: "새 기록",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function NewTastingNotePage({ searchParams }: PageProps<"/journal/new">) {
  const [wines, sp] = await Promise.all([getWineOptions(), searchParams]);
  const wineId = typeof sp.wineId === "string" ? sp.wineId : undefined;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-6 pt-4">
        <AdminGuard>
          <TastingNoteWizard wines={wines} defaultWineId={wineId} />
        </AdminGuard>
      </main>
    </div>
  );
}
