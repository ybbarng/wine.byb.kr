import type { Metadata } from "next";
import { ExploreMap } from "@/features/wine/explore-map";
import { allCountries } from "@/features/wine/wine-geo";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "산지 탐험" };

export interface ExploreRegion {
  name: string;
  lat: number;
  lng: number;
  /** DB 산지 페이지 slug(있을 때만 클릭 이동). */
  slug: string | null;
}

export interface ExploreCountry {
  country: string;
  slug: string | null;
  bbox: [number, number, number, number];
  regions: ExploreRegion[];
  /** 이 나라(및 하위) 와인 수 — 얼마나 탐험했는지 표시용. */
  wines: number;
}

// 전세계 탐험 지도. 큐레이션 국가·산지(wine-geo)에 DB 산지 페이지 slug를 이어 붙여
// 지도에서 클릭하면 상세로 가게 한다. 지도는 클라이언트에서 그린다(maplibre).
export default async function ExplorePage() {
  const regions = await db.region.findMany({
    select: { id: true, slug: true, nameKo: true, country: true, level: true },
  });
  const countryRows = regions.filter((r) => r.level === "country");
  const regionRows = regions.filter((r) => r.level === "region");

  // 나라별 와인 수(직접 + 하위). 국가 행 id와 그 자식 id를 모아 센다.
  const wineCounts = await db.wine.groupBy({ by: ["regionId"], _count: { _all: true } });
  const countByRegionId = new Map(wineCounts.map((w) => [w.regionId, w._count._all]));
  const parentByChild = new Map<string, string>();
  for (const r of regionRows) {
    const parent = countryRows.find((c) => c.nameKo === r.country);
    if (parent) parentByChild.set(r.id, parent.id);
  }

  const countrySlug = (country: string) =>
    countryRows.find((c) => c.nameKo === country)?.slug ?? null;
  // 산지 핀 이름 → DB 산지 slug(같은 나라에서 nameKo가 그 이름을 포함하는 행).
  const regionSlug = (country: string, name: string) =>
    regionRows.find((r) => r.country === country && r.nameKo.includes(name))?.slug ?? null;

  const countries: ExploreCountry[] = allCountries().map(({ country, geo }) => {
    const countryRow = countryRows.find((c) => c.nameKo === country);
    // 이 나라 와인 수 = 국가 행 직접 + 이 나라 소속 지역 행들.
    let wines = countryRow ? (countByRegionId.get(countryRow.id) ?? 0) : 0;
    for (const r of regionRows) {
      if (r.country === country) wines += countByRegionId.get(r.id) ?? 0;
    }
    return {
      country,
      slug: countrySlug(country),
      bbox: geo.bbox,
      wines,
      regions: geo.regions.map((r) => ({
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        slug: regionSlug(country, r.name),
      })),
    };
  });

  return <ExploreMap countries={countries} />;
}
