import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { WineList } from "@/components/WineList";
import { getRegionBySlug } from "@/features/wine/collection-queries";
import { wineGlassFor } from "@/features/wine/wine-glass";
import { joinDot } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/region/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getRegionBySlug(slug);
  return { title: data ? `${data.region.nameKo} 산지` : "산지를 찾을 수 없음" };
}

// (러프) 산지 상세 — 왼쪽 글라스(대표 와인 색)·가운데 지도(이 산지)·오른쪽 설명+와인.
export default async function RegionPage({ params }: PageProps<"/region/[slug]">) {
  const { slug } = await params;
  const data = await getRegionBySlug(slug);
  if (!data) notFound();
  const { region, wines } = data;

  // 대표 글라스: 이 산지의 첫 와인에서. 없으면 기본 레드.
  const rep = wines[0];
  const { absorb, glass } = wineGlassFor(
    rep?.type ?? "red",
    rep?.grapes.map((g) => g.grape.nameKo) ?? []
  );

  const fallback =
    region.latitude != null && region.longitude != null
      ? { lat: region.latitude, lng: region.longitude }
      : region.parent?.latitude != null && region.parent?.longitude != null
        ? { lat: region.parent.latitude, lng: region.parent.longitude }
        : null;

  return (
    <WineDetailView
      absorb={absorb}
      glass={glass}
      country={region.country ?? region.parent?.nameKo ?? null}
      regionName={region.nameKo}
      fallback={fallback}
      label={region.nameKo}
    >
      <div className="text-xs uppercase tracking-wide text-muted">산지</div>
      <h1 className="mt-1 font-serif text-2xl leading-tight text-foreground">{region.nameKo}</h1>
      {region.nameLocal ? <p className="text-sm text-muted">{region.nameLocal}</p> : null}
      <p className="mt-2 text-sm text-foreground/80">
        {joinDot(region.parent?.nameKo, region.country)}
      </p>

      {region.descriptionKo ? (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
          {region.descriptionKo}
        </p>
      ) : null}

      {region.climate || region.soil ? (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          {region.climate ? (
            <>
              <dt className="text-muted">기후</dt>
              <dd className="text-foreground/85">{region.climate}</dd>
            </>
          ) : null}
          {region.soil ? (
            <>
              <dt className="text-muted">토양</dt>
              <dd className="text-foreground/85">{region.soil}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">이 산지의 와인</h2>
        <WineList wines={wines} />
      </section>
    </WineDetailView>
  );
}
