import { averageHex, wineGlassFor } from "@/features/wine/wine-glass";
import { db } from "@/lib/db";
import { decodeSlug } from "@/lib/slug";

// 와인 상세(탐험의 핵심 화면)용 조회.

/** slug로 와인 + 생산자·지역·품종·내 기록, 그리고 유사 와인을 가져온다. */
export async function getWineBySlug(rawSlug: string) {
  const slug = decodeSlug(rawSlug);
  const wine = await db.wine.findUnique({
    where: { slug },
    include: {
      producer: true,
      region: { include: { parent: true } },
      grapes: { include: { grape: true }, orderBy: [{ percent: "desc" }, { id: "asc" }] },
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

/** 홈에서 잔을 갈아 끼우며 보여 줄 와인 한 종. 잔·색·이름·산지에 필요한 것만. */
export type RotationWine = {
  slug: string;
  nameKo: string;
  nameLocal: string | null;
  type: string | null;
  abv: number | null;
  /** 잔 안 와인의 흡수계수(색). */
  absorb: [number, number, number];
  /** GLASSES 인덱스. */
  glass: number;
  /** "샤블리 · 프랑스" 처럼 이름 아래 붙일 한 줄. 없으면 null. */
  origin: string | null;
  /** 나라 이름만 따로. 건배말을 그 나라 말로 고르는 데 쓴다(features/glass/toast.ts). */
  country: string | null;
};

/**
 * 홈 순환에 쓸 와인들. 색·잔은 상세 페이지와 **같은 방법**으로 미리 정한다
 * (wineGlassFor + 시음 기록 색 평균) — 홈에서 본 잔이 눌러 들어간 페이지와 달라
 * 보이면 안 된다.
 *
 * 서버에서 한 번에 다 내려보낸다. 잔을 바꿀 때마다 요청하면 네트워크가 느릴 때
 * 리듬이 끊긴다 — 60종 남짓이라 그냥 다 보내는 편이 단순하다.
 */
export async function getRotationWines(): Promise<RotationWine[]> {
  const wines = await db.wine.findMany({
    select: {
      slug: true,
      nameKo: true,
      nameLocal: true,
      type: true,
      abv: true,
      colorHex: true,
      region: { select: { nameKo: true, country: true, parent: { select: { nameKo: true } } } },
      grapes: {
        select: { grape: { select: { nameKo: true } } },
        orderBy: [{ percent: "desc" }, { id: "asc" }],
      },
      tastingNotes: { where: { isPublic: true }, select: { colorHex: true } },
    },
    orderBy: { slug: "asc" },
  });

  return wines.map((w) => {
    const displayColor = w.colorHex ?? averageHex(w.tastingNotes.map((n) => n.colorHex));
    const { absorb, glass } = wineGlassFor(
      w.type,
      w.grapes.map((g) => g.grape.nameKo),
      w.slug,
      displayColor
    );
    const country = w.region?.country ?? w.region?.parent?.nameKo ?? null;
    const parts = [w.region?.nameKo, country].filter((p): p is string => !!p);
    return {
      slug: w.slug,
      nameKo: w.nameKo,
      nameLocal: w.nameLocal,
      type: w.type,
      abv: w.abv,
      absorb,
      glass,
      origin: parts.length > 0 ? [...new Set(parts)].join(" · ") : null,
      // `country` 를 다시 읽는다 — 위의 지역 변수는 국가가 비면 **상위 지역 이름**으로
      // 대신 채운 값이라 이름 아래 한 줄에는 맞아도 나라로 쓰면 안 된다. 미국의
      // "조지아" 같은 지역명이 들어오면 조지아(나라) 말로 건배하게 된다.
      country: w.region?.country ?? null,
    };
  });
}
