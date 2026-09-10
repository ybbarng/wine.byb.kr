import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { WineList } from "@/components/WineList";
import { grapeInfo } from "@/features/wine/curation/grape-info";
import { getGrapeBySlug } from "@/features/wine/db/collection-queries";
import { GrapeCharacter } from "@/features/wine/ui/grape-character";
import { GrapeColorDot } from "@/features/wine/ui/grape-color";
import { RegionMyStats } from "@/features/wine/ui/region-my-stats";
import { wineGlassFor } from "@/features/wine/wine-glass";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/grape/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getGrapeBySlug(slug);
  return { title: data ? `${data.grape.nameKo} 품종` : "품종을 찾을 수 없음" };
}

// 품종 상세 — 왼쪽 글라스(품종 색)·가운데 지도(대표 산지)·오른쪽 특성+와인.
// DB에 특성이 비어 있으면 큐레이션된 grape-info로 채운다.
export default async function GrapePage({ params }: PageProps<"/grape/[slug]">) {
  const { slug } = await params;
  const data = await getGrapeBySlug(slug);
  if (!data) notFound();
  const { grape, wines, stats } = data;
  const curated = grapeInfo(grape.nameKo);

  // 글라스: 품종 색 기준.
  const baseType = grape.color === "white" ? "white" : "red";
  const { absorb, glass } = wineGlassFor(baseType, [grape.nameKo]);

  // 설명: DB 우선, 없으면 큐레이션.
  const description = grape.descriptionKo ?? curated?.desc ?? null;

  // 아로마: DB aromaProfile(JSON) 우선, 없으면 큐레이션.
  let dbAroma: string[] = [];
  if (grape.aromaProfile) {
    try {
      const arr = JSON.parse(grape.aromaProfile);
      if (Array.isArray(arr)) dbAroma = arr.map(String);
    } catch {
      dbAroma = [grape.aromaProfile];
    }
  }
  const character = {
    body: grape.body ?? curated?.body ?? null,
    acidity: grape.acidity ?? curated?.acidity ?? null,
    tannin: grape.tannin ?? curated?.tannin ?? null,
    sweetness: grape.sweetness ?? curated?.sweetness ?? null,
    aroma: dbAroma.length > 0 ? dbAroma : (curated?.aroma ?? []),
    pairings: curated?.pairings ?? [],
  };

  // 대표 산지: 이 품종을 쓴 내 와인의 산지를 빈도순으로. 각 칩은 산지 페이지로.
  const regionTally = new Map<string, { slug: string; nameKo: string; n: number }>();
  for (const w of wines) {
    if (!w.region) continue;
    const cur = regionTally.get(w.region.id);
    if (cur) cur.n += 1;
    else regionTally.set(w.region.id, { slug: w.region.slug, nameKo: w.region.nameKo, n: 1 });
  }
  const topRegions = [...regionTally.values()].sort((a, b) => b.n - a.n).slice(0, 8);

  // 지도: 이 품종을 쓴 대표 와인의 산지.
  const rep = wines[0]?.region ?? null;
  const country = rep?.country ?? rep?.parent?.nameKo ?? null;
  const fallback =
    rep?.latitude != null && rep?.longitude != null
      ? { lat: rep.latitude, lng: rep.longitude }
      : null;

  return (
    <WineDetailView
      absorb={absorb}
      glass={glass}
      country={country}
      regionName={rep?.nameKo ?? null}
      fallback={fallback}
      label={grape.nameKo}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
        <GrapeColorDot nameKo={grape.nameKo} />
        포도 품종
      </div>
      <h1 className="mt-1 font-serif text-2xl leading-tight text-foreground">{grape.nameKo}</h1>
      {grape.nameLocal ? <p className="text-sm text-muted">{grape.nameLocal}</p> : null}

      {description ? (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
          {description}
        </p>
      ) : null}

      <RegionMyStats stats={stats} />

      <GrapeCharacter
        body={character.body}
        acidity={character.acidity}
        tannin={character.tannin}
        sweetness={character.sweetness}
        aroma={character.aroma}
        pairings={character.pairings}
      />

      {topRegions.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">대표 산지</h2>
          <div className="flex flex-wrap gap-2">
            {topRegions.map((r) => (
              <Link
                key={r.slug}
                href={`/region/${r.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground/12 bg-foreground/5 px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:border-foreground/25 hover:bg-foreground/10"
              >
                {r.nameKo}
                {r.n > 1 ? <span className="text-muted">{r.n}</span> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">이 품종의 와인</h2>
        <WineList wines={wines} />
      </section>
    </WineDetailView>
  );
}
