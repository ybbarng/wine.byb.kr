import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminGuard } from "@/features/admin/admin-guard";
import { WineForm } from "@/features/wine/wine-form";

export const metadata: Metadata = {
  title: "새 와인",
  robots: { index: false },
};

export default function NewWinePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-24">
        <header className="mt-6">
          <h1 className="font-serif text-3xl tracking-tight text-foreground">새 와인</h1>
          <p className="mt-2 text-sm text-rose/60">
            목록에 없는 와인을 등록합니다. 이름만 있으면 되고, 나머지는 나중에 채워도 됩니다.
          </p>
        </header>
        <AdminGuard>
          <WineForm />
        </AdminGuard>
      </main>
    </div>
  );
}
