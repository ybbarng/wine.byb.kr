import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CatalogView } from "@/features/catalog/catalog-view";
import { countryFlag } from "@/features/wine/country-names";
import { regionInfo } from "@/features/wine/region-info";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "도감",
  description: "와인·산지·품종을 한눈에 훑어보는 목록.",
};

export interface CatalogRegionGroup {
  country: string;
  countrySlug: string | null;
  flag: string | null;
  regions: { slug: string; name: string }[];
}

// 도감 — 와인·산지·품종 전체를 목록으로 훑어본다. 검색(콕 집기)·탐험(지도) 다음의
// 세 번째 브라우징 모드. 데이터만 서버에서 모아 클라이언트 탭 뷰에 넘긴다.
export default async function CatalogPage() {
  const [wines, regions, grapes] = await Promise.all([
    db.wine.findMany({
      include: { region: { include: { parent: true } } },
      orderBy: { nameKo: "asc" },
    }),
    db.region.findMany({
      select: { slug: true, nameKo: true, country: true, level: true },
      orderBy: { nameKo: "asc" },
    }),
    db.grape.findMany({ select: { slug: true, nameKo: true, nameLocal: true } }),
  ]);

  // 산지는 나라별로 묶어 보여준다. 지저분한 시드 이름은 큐레이션된 이름으로 다듬는다.
  const countryRows = regions.filter((r) => r.level === "country");
  const regionRows = regions.filter((r) => r.level === "region");
  const byCountry = new Map<string, { slug: string; name: string }[]>();
  for (const r of regionRows) {
    const country = r.country ?? "기타";
    const name = regionInfo(r.nameKo)?.name ?? r.nameKo;
    const list = byCountry.get(country) ?? [];
    // 지저분한 시드에서 여러 행이 같은 산지로 정제될 수 있어 이름 기준 중복 제거.
    if (!list.some((x) => x.name === name)) list.push({ slug: r.slug, name });
    byCountry.set(country, list);
  }
  // 나라 헤더는 국가 행에서(슬러그·국기), 그 아래 하위 산지를 나열한다.
  const countryNames = [
    ...new Set([...countryRows.map((c) => c.nameKo), ...byCountry.keys()]),
  ].sort();
  const regionGroups: CatalogRegionGroup[] = countryNames.map((country) => ({
    country,
    countrySlug: countryRows.find((c) => c.nameKo === country)?.slug ?? null,
    flag: countryFlag(country),
    regions: byCountry.get(country) ?? [],
  }));

  const grapeList = grapes
    .map((g) => ({ slug: g.slug, nameKo: g.nameKo, nameLocal: g.nameLocal }))
    .sort((a, b) => a.nameKo.localeCompare(b.nameKo, "ko"));

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24">
        <header className="mt-6">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">도감</h1>
          <p className="mt-2 text-muted/80">와인·산지·품종을 한눈에 훑어봅니다.</p>
        </header>
        <CatalogView wines={wines} regions={regionGroups} grapes={grapeList} />
      </main>
    </div>
  );
}
