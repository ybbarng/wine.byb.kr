import { regionInfo } from "@/features/wine/curation/region-info";
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
  const producers = await db.producer.findMany({
    where: { regionId: { in: regionIds } },
    include: { _count: { select: { wines: true } } },
    orderBy: { nameKo: "asc" },
  });
  return { region, wines, stats, producers };
}

export interface SimilarRegion {
  slug: string;
  nameKo: string;
  country: string | null;
  /** 겹치는 주력 품종(추천 이유). */
  shared: string[];
}

// 비슷한 산지 — 내 DB에 실제로 있는 지역 중 주력 품종(큐레이션)이 겹치는 곳을 고른다.
// DB에 있는 지역만 대상이라 링크가 늘 유효하다. 겹치는 품종 수로 정렬해 상위 4곳.
export async function getSimilarRegions(
  keyGrapes: string[] | undefined,
  excludeIds: string[]
): Promise<SimilarRegion[]> {
  if (!keyGrapes || keyGrapes.length === 0) return [];
  const mine = new Set(keyGrapes);
  const rows = await db.region.findMany({
    where: { level: "region", id: { notIn: excludeIds } },
    select: { slug: true, nameKo: true, country: true },
  });
  const seen = new Set<string>(); // 큐레이션 이름 기준 중복 제거(지저분한 시드에 같은 산지가 여러 행)
  const scored: (SimilarRegion & { score: number })[] = [];
  for (const r of rows) {
    const info = regionInfo(r.nameKo);
    if (!info?.keyGrapes || !info.name || seen.has(info.name)) continue;
    const shared = info.keyGrapes.filter((g) => mine.has(g));
    if (shared.length === 0) continue;
    seen.add(info.name);
    scored.push({
      slug: r.slug,
      nameKo: r.nameKo,
      country: r.country,
      shared,
      score: shared.length,
    });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ score: _score, ...rest }) => rest);
}

/** 생산자 상세 — 생산자 + 지역 + 그 생산자의 와인. */
export async function getProducerBySlug(rawSlug: string) {
  const slug = decodeSlug(rawSlug);
  const producer = await db.producer.findUnique({
    where: { slug },
    include: { region: { include: { parent: true } } },
  });
  if (!producer) return null;
  const wines = await db.wine.findMany({
    where: { producerId: producer.id },
    include: WINE_LIST_INCLUDE,
    take: 24,
  });
  return { producer, wines };
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

/** 품종 상세 — 품종 + 그 품종을 쓴 와인 + 내 기록 통계. */
export async function getGrapeBySlug(rawSlug: string) {
  const slug = decodeSlug(rawSlug);
  const grape = await db.grape.findUnique({ where: { slug } });
  if (!grape) return null;
  const wines = await db.wine.findMany({
    where: { grapes: { some: { grapeId: grape.id } } },
    include: WINE_LIST_INCLUDE,
    take: 24,
  });
  const stats = await grapeTastingStats(grape.id);
  return { grape, wines, stats };
}

// 이 품종을 쓴 와인들의 시음 기록을 집계한다(산지 통계와 같은 모양, RegionStats 재사용).
async function grapeTastingStats(grapeId: string): Promise<RegionStats> {
  const notes = await db.tastingNote.findMany({
    where: { wine: { grapes: { some: { grapeId } } } },
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

/** 타입 컬렉션 — 해당 종류의 와인. */
export async function getWinesByType(type: string) {
  return db.wine.findMany({
    where: { type },
    include: WINE_LIST_INCLUDE,
    take: 24,
  });
}
