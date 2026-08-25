import { joinDot } from "@/lib/format";
import { wineTypeLabel } from "@/lib/wine";

// 통합 검색 결과 한 줄. 분류(kind)와 각자의 이동 경로(href)를 담는다.
export type SearchResult = {
  kind: "region" | "grape" | "wine";
  href: string;
  name: string;
  sub: string;
};

// 조립에 필요한 최소 형태(Prisma 결과가 구조적으로 만족한다).
type RegionRow = {
  slug: string;
  nameKo: string;
  country: string | null;
  parent: { nameKo: string } | null;
};
type GrapeRow = { slug: string; nameKo: string; nameLocal: string | null };
type WineRow = {
  slug: string;
  nameKo: string;
  nameLocal: string | null;
  type: string | null;
  region: { nameKo: string } | null;
};

export const SEARCH_RESULT_LIMIT = 8;

// 산지·품종·와인 조회 결과를 드롭다운용 목록으로 합친다.
// 넓은 분류(산지·품종)를 먼저, 그다음 와인. 전체를 SEARCH_RESULT_LIMIT개로 자른다.
export function buildSearchResults(input: {
  regions: RegionRow[];
  grapes: GrapeRow[];
  wines: WineRow[];
}): SearchResult[] {
  const regions: SearchResult[] = input.regions.map((r) => ({
    kind: "region",
    href: `/region/${r.slug}`,
    name: r.nameKo,
    sub: r.country ?? r.parent?.nameKo ?? "산지",
  }));
  const grapes: SearchResult[] = input.grapes.map((g) => ({
    kind: "grape",
    href: `/grape/${g.slug}`,
    name: g.nameKo,
    sub: g.nameLocal ?? "",
  }));
  const wines: SearchResult[] = input.wines.map((w) => ({
    kind: "wine",
    href: `/wine/${w.slug}`,
    name: w.nameLocal ?? w.nameKo,
    sub: joinDot(w.region?.nameKo, wineTypeLabel(w.type)),
  }));
  return [...regions, ...grapes, ...wines].slice(0, SEARCH_RESULT_LIMIT);
}
