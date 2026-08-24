import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createWine } from "@/features/wine/mutations";
import { wineSchema } from "@/features/wine/wine-schema";
import { verifyAdmin } from "@/lib/auth";

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
