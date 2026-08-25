import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 통합 검색 — 와인 이름(한/영)·산지·품종으로 매칭. 결과는 와인 상세(/wine/[slug])로.
// (데이터가 작아 서버 쿼리로 충분. 추후 산지 결과 /region/[slug] 도 합칠 수 있음.)
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ results: [] });

  const wines = await db.wine.findMany({
    where: {
      OR: [
        { nameKo: { contains: q } },
        { nameLocal: { contains: q } },
        { region: { nameKo: { contains: q } } },
        { grapes: { some: { grape: { nameKo: { contains: q } } } } },
      ],
    },
    include: { region: true },
    take: 8,
  });

  const results = wines.map((w) => ({
    slug: w.slug,
    name: w.nameLocal ?? w.nameKo,
    nameKo: w.nameKo,
    sub: w.region?.nameKo ?? "",
    type: w.type ?? "",
  }));

  return NextResponse.json({ results });
}
