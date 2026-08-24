import { db } from "@/lib/db";

// 와인 상세(탐험의 핵심 화면)용 조회.

/** slug로 와인 + 생산자·지역·품종·내 기록, 그리고 유사 와인을 가져온다. */
export async function getWineBySlug(slug: string) {
  const wine = await db.wine.findUnique({
    where: { slug },
    include: {
      producer: true,
      region: { include: { parent: true } },
      grapes: { include: { grape: true }, orderBy: { percent: "desc" } },
      tastingNotes: { where: { isPublic: true }, orderBy: [{ drankOn: "desc" }] },
    },
  });
  if (!wine) return null;

  // 유사: 같은 종류이거나 품종을 하나라도 공유하는 와인.
  const grapeIds = wine.grapes.map((g) => g.grapeId);
  const or: object[] = [];
  if (wine.type) or.push({ type: wine.type });
  if (grapeIds.length > 0) or.push({ grapes: { some: { grapeId: { in: grapeIds } } } });

  const similar =
    or.length > 0
      ? await db.wine.findMany({
          where: { id: { not: wine.id }, OR: or },
          include: { region: { include: { parent: true } } },
          take: 6,
        })
      : [];

  return { wine, similar };
}
