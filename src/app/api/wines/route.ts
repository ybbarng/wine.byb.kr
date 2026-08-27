import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createWine } from "@/features/wine/mutations";
import { wineSchema } from "@/features/wine/wine-schema";
import { verifyAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 색 도구용 와인 목록(이름·타입·현재 지정색). 조회는 누구나.
export async function GET() {
  const wines = await db.wine.findMany({
    select: { slug: true, nameKo: true, nameLocal: true, type: true, colorHex: true },
    orderBy: { nameLocal: "asc" },
  });
  return NextResponse.json({ wines });
}

// 새 와인을 등록한다. 편집이므로 verifyAdmin으로 서버에서 다시 확인한다.
export async function POST(request: NextRequest) {
  const auth = verifyAdmin(request);
  if (!auth.success) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = wineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력이 올바르지 않습니다.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const wine = await createWine(parsed.data);
  return NextResponse.json(wine, { status: 201 });
}
