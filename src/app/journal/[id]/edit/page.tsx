import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AdminGuard } from "@/features/admin/admin-guard";
import { getTastingNote, getWineOptions } from "@/features/journal/queries";
import type { ExistingNote } from "@/features/journal/tasting-note-form";
import { parseAromas, parseFlavor, toDateInput } from "@/features/journal/tasting-note-schema";
import { TastingNoteWizard } from "@/features/journal/tasting-note-wizard";

export const metadata: Metadata = {
  title: "기록 수정",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function EditTastingNotePage({ params }: PageProps<"/journal/[id]/edit">) {
  const { id } = await params;
  const [data, wines] = await Promise.all([getTastingNote(id), getWineOptions()]);
  if (!data) notFound();

  const n = data.note;
  const existing: ExistingNote = {
    id: n.id,
    wineId: n.wineId,
    drankOn: toDateInput(n.drankOn),
    purchasedOn: toDateInput(n.purchasedOn),
    vintageYear: n.vintageYear,
    purchasePrice: n.purchasePrice,
    purchasePlace: n.purchasePlace,
    rating: n.rating,
    repurchase: n.repurchase,
    value: n.value,
    colorHex: n.colorHex,
    aromasConfirmed: parseAromas(n.aromasConfirmed),
    flavorFelt: parseFlavor(n.flavorFelt),
    legsFelt: n.legsFelt,
    bodyText: n.bodyText,
    foodPaired: n.foodPaired,
  };

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-6 pt-4">
        <AdminGuard>
          <TastingNoteWizard wines={wines} existing={existing} />
        </AdminGuard>
      </main>
    </div>
  );
}
