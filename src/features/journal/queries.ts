import { parseWinemaking } from "@/features/wine/winemaking";
import { db } from "@/lib/db";

// 마신 기록(내가 마신 기록) 조회. 작성은 관리자만, 조회는 누구나(§4.5).

/**
 * 작성 폼의 와인 선택용 목록 — 원어 이름 순. 색 설정을 위해 종류·현재 색도 싣고,
 * 가이드 시음 향 단계(P2)의 예상 향을 만들려고 품종 이름도 비율순으로 싣는다.
 */
export async function getWineOptions() {
  const wines = await db.wine.findMany({
    select: {
      id: true,
      nameKo: true,
      nameLocal: true,
      type: true,
      colorHex: true,
      oakAging: true,
      winemaking: true,
      abv: true,
      // 단맛은 품종이 못 정하는 경우가 있어 라벨 표기(트로켄·브뤼)에서 읽는다.
      classification: true,
      // 산지 기후 안내용 — 세부 산지 이름이 없으면 상위(국가·광역) 이름으로 찾는다.
      region: { select: { nameKo: true, parent: { select: { nameKo: true } } } },
      grapes: {
        select: { percent: true, grape: { select: { nameKo: true } } },
        // 2차 키가 없으면 비율이 전부 NULL 인 블렌드에서 순서가 정해지지 않는다 —
        // 실제로 샤또 딸보·에스터하지가 저장 순서와 다르게 나와 엉뚱한 품종이 주 품종으로
        // 잡혔다. blend.ts 가 "비율을 모르면 첫 품종이 대표"로 보므로 순서가 곧 결과다.
        orderBy: [{ percent: "desc" }, { id: "asc" }],
      },
    },
    orderBy: { nameLocal: "asc" },
  });
  return wines.map((w) => ({
    id: w.id,
    nameKo: w.nameKo,
    nameLocal: w.nameLocal,
    type: w.type,
    colorHex: w.colorHex,
    oakAging: w.oakAging,
    winemaking: parseWinemaking(w.winemaking),
    abv: w.abv,
    classification: w.classification,
    regionName: w.region?.nameKo ?? w.region?.parent?.nameKo ?? null,
    // 비율을 함께 넘긴다 — 주 품종/곁들임을 가르는 근거다(features/wine/blend).
    grapes: w.grapes.map((g) => ({ name: g.grape.nameKo, percent: g.percent })),
  }));
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
  // 아직 안 마신(음용일 없는) 구매를 맨 위로. 같은 그룹 안에서는 미음용=구매일,
  // 음용=음용일 기준 역순(최근이 위).
  const drank = (n: (typeof notes)[number]) => n.drankOn != null;
  const key = (n: (typeof notes)[number]) => (n.drankOn ?? n.purchasedOn ?? n.createdAt).getTime();
  return notes.sort((a, b) => {
    if (drank(a) !== drank(b)) return drank(a) ? 1 : -1; // 미음용이 앞
    return key(b) - key(a) || b.createdAt.getTime() - a.createdAt.getTime();
  });
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
          grapes: { include: { grape: true }, orderBy: [{ percent: "desc" }, { id: "asc" }] },
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
