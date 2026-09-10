import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { WineList } from "@/components/WineList";
import { getWinesByType } from "@/features/wine/db/collection-queries";
import { wineGlassFor } from "@/features/wine/wine-glass";
import { WINE_TYPE_LABELS, wineTypeLabel } from "@/lib/wine";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/type/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${wineTypeLabel(slug)} 와인` };
}

// (러프) 종류 컬렉션 — 왼쪽 글라스(종류 기본색)·가운데 지도(대표 산지)·오른쪽 목록.
export default async function TypePage({ params }: PageProps<"/type/[slug]">) {
  const { slug } = await params;
  if (!WINE_TYPE_LABELS[slug]) notFound();
  const wines = await getWinesByType(slug);

  // 글라스: 종류 기본색. 대표 와인의 품종이 있으면 그 색을 반영.
  const rep = wines[0];
  const { absorb, glass } = wineGlassFor(slug, rep?.grapes.map((g) => g.grape.nameKo) ?? []);

  // 지도: 대표 와인의 산지.
  const region = rep?.region ?? null;
  const country = region?.country ?? region?.parent?.nameKo ?? null;
  const fallback =
    region?.latitude != null && region?.longitude != null
      ? { lat: region.latitude, lng: region.longitude }
      : null;

  return (
    <WineDetailView
      absorb={absorb}
      glass={glass}
      country={country}
      regionName={region?.nameKo ?? null}
      fallback={fallback}
      label={wineTypeLabel(slug)}
    >
      <div className="text-xs uppercase tracking-wide text-muted">종류</div>
      <h1 className="mt-1 font-serif text-2xl leading-tight text-foreground">
        {wineTypeLabel(slug)} 와인
      </h1>
      <p className="mt-1 text-sm text-muted">{wines.length}종</p>

      <section className="mt-6">
        <WineList wines={wines} />
      </section>
    </WineDetailView>
  );
}
