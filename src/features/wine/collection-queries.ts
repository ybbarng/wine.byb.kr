import { db } from "@/lib/db";

// 산지/품종/타입 "컬렉션" 페이지용 조회. (러프 — 목록 + 대표 정보)
const WINE_LIST_INCLUDE = {
  region: { include: { parent: true } },
  grapes: { include: { grape: true }, orderBy: { percent: "desc" as const } },
};

/** 산지 상세 — 지역 + 그 지역(및 하위)의 와인. */
export async function getRegionBySlug(slug: string) {
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
  return { region, wines };
}

/** 품종 상세 — 품종 + 그 품종을 쓴 와인. */
export async function getGrapeBySlug(slug: string) {
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
