import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { WineList } from "@/components/WineList";
import { getRegionBySlug } from "@/features/wine/collection-queries";
import { countryFlag } from "@/features/wine/country-names";
import { GrapeColorDot } from "@/features/wine/grape-color";
import { RegionHierarchy } from "@/features/wine/region-hierarchy";
import { countryInfo, regionInfo } from "@/features/wine/region-info";
import { RegionTerroir } from "@/features/wine/region-terroir";
import { wineGlassFor } from "@/features/wine/wine-glass";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/region/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getRegionBySlug(slug);
  return { title: data ? `${data.region.nameKo} 산지` : "산지를 찾을 수 없음" };
}

// 산지 상세 — 왼쪽 글라스(대표 와인 색)·가운데 지도+계층·오른쪽 설명+와인.
// DB에 설명이 비어 있으면 큐레이션된 region-info로 채운다(국가는 countryInfo, 지역은 regionInfo).
export default async function RegionPage({ params }: PageProps<"/region/[slug]">) {
  const { slug } = await params;
  const data = await getRegionBySlug(slug);
  if (!data) notFound();
  const { region, wines } = data;
  const isCountry = region.level === "country";

  // 대표 글라스: 이 산지의 첫 와인에서. 없으면 기본 레드.
  const rep = wines[0];
  const { absorb, glass } = wineGlassFor(
    rep?.type ?? "red",
    rep?.grapes.map((g) => g.grape.nameKo) ?? []
  );

  // 지도·계층에 쓸 국가/지역 이름. 국가 페이지면 국가만, 지역 페이지면 국가+이 지역.
  const countryName = isCountry ? region.nameKo : (region.country ?? region.parent?.nameKo ?? null);
  const regionName = isCountry ? null : region.nameKo;

  const fallback =
    region.latitude != null && region.longitude != null
      ? { lat: region.latitude, lng: region.longitude }
      : region.parent?.latitude != null && region.parent?.longitude != null
        ? { lat: region.parent.latitude, lng: region.parent.longitude }
        : null;

  // 큐레이션 산지 정보(지역 페이지에서만). 설명·떼루아를 여기서 끌어온다.
  const curated = isCountry ? null : regionInfo(region.nameKo);

  // 설명: DB 값이 있으면 우선, 없으면 큐레이션 데이터로 채운다.
  const description =
    region.descriptionKo ?? (isCountry ? countryInfo(region.nameKo) : (curated?.desc ?? null));

  // 떼루아: DB 값 우선, 없으면 큐레이션. 품종·스타일은 큐레이션에만 있다.
  const terroir = {
    climate: region.climate ?? curated?.climate ?? null,
    soil: region.soil ?? curated?.soil ?? null,
    classification: curated?.classification ?? null,
    keyGrapes: curated?.keyGrapes,
    styles: curated?.styles,
  };

  // 대표 품종: 이 산지 와인들의 품종을 빈도순으로 집계(상위 8개). 각 칩은 품종 페이지로.
  const grapeTally = new Map<string, { slug: string; nameKo: string; n: number }>();
  for (const w of wines) {
    for (const g of w.grapes) {
      const cur = grapeTally.get(g.grape.id);
      if (cur) cur.n += 1;
      else grapeTally.set(g.grape.id, { slug: g.grape.slug, nameKo: g.grape.nameKo, n: 1 });
    }
  }
  const topGrapes = [...grapeTally.values()].sort((a, b) => b.n - a.n).slice(0, 8);

  // 국가 페이지면 하위 산지로, 지역 페이지면 상위(국가) 산지로 잇는다.
  const children = region.children;
  const parentHref = region.parent ? `/region/${region.parent.slug}` : null;

  return (
    <WineDetailView
      absorb={absorb}
      glass={glass}
      country={countryName}
      regionName={regionName}
      fallback={fallback}
      label={region.nameKo}
      belowMap={
        countryName ? (
          <div>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">산지 계층</h2>
            <RegionHierarchy
              country={countryName}
              regionName={regionName}
              countryHref={isCountry ? null : parentHref}
              regionHref={null}
            />
          </div>
        ) : null
      }
    >
      <div className="text-xs uppercase tracking-wide text-muted">
        {isCountry ? "국가" : "산지"}
      </div>
      <h1 className="mt-1 font-serif text-2xl leading-tight text-foreground">
        {isCountry && countryFlag(region.nameKo) ? (
          <span className="mr-1.5" aria-hidden>
            {countryFlag(region.nameKo)}
          </span>
        ) : null}
        {region.nameKo}
      </h1>
      {region.nameLocal ? <p className="text-sm text-muted">{region.nameLocal}</p> : null}
      {!isCountry && (region.parent || region.country) ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground/80">
          {countryFlag(region.parent?.nameKo ?? region.country) ? (
            <span aria-hidden>{countryFlag(region.parent?.nameKo ?? region.country)}</span>
          ) : null}
          {parentHref ? (
            <Link
              href={parentHref}
              className="underline decoration-foreground/25 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
            >
              {region.parent?.nameKo}
            </Link>
          ) : null}
          {!parentHref && region.country ? region.country : null}
        </p>
      ) : null}

      {description ? (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
          {description}
        </p>
      ) : null}

      <RegionTerroir
        climate={terroir.climate}
        soil={terroir.soil}
        classification={terroir.classification}
        keyGrapes={terroir.keyGrapes}
        styles={terroir.styles}
      />

      {topGrapes.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">내가 마신 품종</h2>
          <div className="flex flex-wrap gap-2">
            {topGrapes.map((g) => (
              <Link
                key={g.slug}
                href={`/grape/${g.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground/12 bg-foreground/5 px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:border-foreground/25 hover:bg-foreground/10"
              >
                <GrapeColorDot nameKo={g.nameKo} />
                {g.nameKo}
                {g.n > 1 ? <span className="ml-0.5 text-muted">{g.n}</span> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {children.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">하위 산지</h2>
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/region/${c.slug}`}
                className="rounded-lg border border-foreground/12 px-2.5 py-1.5 text-sm text-foreground/85 transition-colors hover:border-foreground/25 hover:bg-foreground/5"
              >
                {c.nameKo}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">
          {isCountry ? "이 나라의 와인" : "이 산지의 와인"}
        </h2>
        <WineList wines={wines} />
      </section>
    </WineDetailView>
  );
}
