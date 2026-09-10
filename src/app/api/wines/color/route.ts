import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateWineColor } from "@/features/wine/db/mutations";
import { verifyAdmin } from "@/lib/auth";

// 컬러피커로 지정한 색을 와인에 저장한다(관리자만). colorHex=null 이면 추정색으로 되돌린다.
export async function POST(request: NextRequest) {
  const auth = verifyAdmin(request);
  if (!auth.success) return auth.response;

  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug : null;
  const colorHex = body?.colorHex;
  if (!slug) return NextResponse.json({ error: "slug 필요" }, { status: 400 });
  if (colorHex != null && !/^#[0-9a-fA-F]{6}$/.test(colorHex)) {
    return NextResponse.json({ error: "colorHex는 #rrggbb" }, { status: 400 });
  }

  await updateWineColor(slug, colorHex ?? null);
  return NextResponse.json({ ok: true });
}
