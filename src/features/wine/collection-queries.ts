import { db } from "@/lib/db";
import { decodeSlug } from "@/lib/slug";

// 산지/품종/타입 "컬렉션" 페이지용 조회. (러프 — 목록 + 대표 정보)
const WINE_LIST_INCLUDE = {
  region: { include: { parent: true } },
  grapes: { include: { grape: true }, orderBy: { percent: "desc" as const } },
};

/** 산지 상세 — 지역 + 그 지역(및 하위)의 와인 + 내 기록 통계. */
export async function getRegionBySlug(rawSlug: string) {
  const slug = decodeSlug(rawSlug);
  const region = await db.region.findUnique({
    where: { slug },
    include: { parent: true, children: true },
  });
  if (!region) return null;
  const regionIds = [region.id, ...region.children.map((c) => c.id)];
  const wines = await db.wine.findMany({
    where: { regionId: { in: regionIds } },
    include: WINE_LIST_INCLUDE,
    take: 24,
  });
  const stats = await regionTastingStats(regionIds);
  return { region, wines, stats };
}

export interface RegionStats {
  /** 이 산지(및 하위) 와인의 시음 기록 수. */
  tastings: number;
  /** 기록이 있는 서로 다른 와인 수. */
  winesTasted: number;
  /** 평균 별점(기록된 것만). 없으면 null. */
  avgRating: number | null;
  /** 평균 구매가(기록된 것만, KRW). 없으면 null. */
  avgPrice: number | null;
}

// 이 산지(및 하위) 와인들의 시음 기록을 집계한다. 개인 사이트라 "나와 이 산지의 관계"를 보여준다.
async function regionTastingStats(regionIds: string[]): Promise<RegionStats> {
  const notes = await db.tastingNote.findMany({
    where: { wine: { regionId: { in: regionIds } } },
    select: { rating: true, purchasePrice: true, wineId: true },
  });
  const ratings = notes.map((n) => n.rating).filter((r): r is number => r != null);
  const prices = notes.map((n) => n.purchasePrice).filter((p): p is number => p != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    tastings: notes.length,
    winesTasted: new Set(notes.map((n) => n.wineId)).size,
    avgRating: avg(ratings),
    avgPrice: avg(prices),
  };
}

/** 품종 상세 — 품종 + 그 품종을 쓴 와인. */
export async function getGrapeBySlug(rawSlug: string) {
  const slug = decodeSlug(rawSlug);
  const grape = await db.grape.findUnique({ where: { slug } });
  if (!grape) return null;
  const wines = await db.wine.findMany({
    where: { grapes: { some: { grapeId: grape.id } } },
    include: WINE_LIST_INCLUDE,
    take: 24,
  });
  return { grape, wines };
}

/** 타입 컬렉션 — 해당 종류의 와인. */
export async function getWinesByType(type: string) {
  return db.wine.findMany({
    where: { type },
    include: WINE_LIST_INCLUDE,
    take: 24,
  });
}
