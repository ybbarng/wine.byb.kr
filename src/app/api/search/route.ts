import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildSearchResults } from "@/features/wine/search";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 통합 검색 — 산지·품종·와인을 함께 찾는다. 각 결과는 자기 페이지로 이동한다
// (산지 → /region, 품종 → /grape, 와인 → /wine). 데이터가 작아 서버 쿼리로 충분.
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ results: [] });

  const [regions, grapes, wines] = await Promise.all([
    db.region.findMany({
      where: { OR: [{ nameKo: { contains: q } }, { nameLocal: { contains: q } }] },
      include: { parent: true },
      take: 4,
    }),
    db.grape.findMany({
      where: { OR: [{ nameKo: { contains: q } }, { nameLocal: { contains: q } }] },
      take: 4,
    }),
    db.wine.findMany({
      where: {
        OR: [
          { nameKo: { contains: q } },
          { nameLocal: { contains: q } },
          { region: { nameKo: { contains: q } } },
          { grapes: { some: { grape: { nameKo: { contains: q } } } } },
        ],
      },
      include: { region: true },
      take: 6,
    }),
  ]);

  return NextResponse.json({ results: buildSearchResults({ regions, grapes, wines }) });
}
