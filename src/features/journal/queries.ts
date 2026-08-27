import { db } from "@/lib/db";

// 마신 기록(내가 마신 기록) 조회. 작성은 관리자만, 조회는 누구나(§4.5).

/** 작성 폼의 와인 선택용 목록 — 원어 이름 순. */
export function getWineOptions() {
  return db.wine.findMany({
    select: { id: true, nameKo: true, nameLocal: true },
    orderBy: { nameLocal: "asc" },
  });
}

/**
 * 시음 기록 타임라인. 기본 정렬: 마신 날이 있으면 그날, 아직 시음 전이면
 * 구매일을 기준으로 최근순(둘 다 없으면 기록 생성순). 와인·생산자·지역을 함께 싣는다.
 */
export async function getJournalEntries() {
  const notes = await db.tastingNote.findMany({
    where: { isPublic: true },
    include: {
      wine: {
        include: {
          producer: true,
          region: { include: { parent: true } },
        },
      },
    },
  });
  const key = (n: (typeof notes)[number]) => (n.drankOn ?? n.purchasedOn ?? n.createdAt).getTime();
  return notes.sort((a, b) => key(b) - key(a) || b.createdAt.getTime() - a.createdAt.getTime());
}

export interface JournalStats {
  total: number;
  uniqueWines: number;
  avgPrice: number | null;
  repurchased: number;
  byType: { label: string; count: number }[];
  byCountry: { label: string; count: number }[];
}

/** 마신 기록 통계 — 총 병 수, 마신 와인 종류, 평균 가격, 재구매, 종류/국가 분포. */
export async function getJournalStats(): Promise<JournalStats> {
  const notes = await db.tastingNote.findMany({
    where: { isPublic: true },
    include: { wine: { include: { region: { include: { parent: true } } } } },
  });

  const prices = notes.map((n) => n.purchasePrice).filter((p): p is number => p != null);
  const avgPrice = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null;

  const wineCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const countryCount = new Map<string, number>();
  for (const n of notes) {
    wineCount.set(n.wineId, (wineCount.get(n.wineId) ?? 0) + 1);
    const type = n.wine.type ?? "기타";
    typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
    const country = n.wine.region?.country ?? n.wine.region?.parent?.nameKo ?? "기타";
    countryCount.set(country, (countryCount.get(country) ?? 0) + 1);
  }

  const toSorted = (m: Map<string, number>) =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  return {
    total: notes.length,
    uniqueWines: wineCount.size,
    avgPrice,
    repurchased: [...wineCount.values()].filter((c) => c > 1).length,
    byType: toSorted(typeCount),
    byCountry: toSorted(countryCount),
  };
}

/** 개별 시음 기록 + 같은 와인을 마신 다른 기록(재음용). */
export async function getTastingNote(id: string) {
  const note = await db.tastingNote.findUnique({
    where: { id },
    include: {
      wine: {
        include: {
          producer: true,
          region: { include: { parent: true } },
          grapes: { include: { grape: true }, orderBy: { percent: "desc" } },
        },
      },
    },
  });
  if (!note) return null;

  const others = await db.tastingNote.findMany({
    where: { wineId: note.wineId, id: { not: id }, isPublic: true },
    orderBy: { drankOn: "desc" },
  });

  return { note, others };
}
