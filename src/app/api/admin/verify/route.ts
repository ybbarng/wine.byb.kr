import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth";

// 로그인 폼이 비밀번호가 맞는지 확인할 때 부르는 최소 엔드포인트.
// 편집 API들은 각자 verifyAdmin을 다시 호출해 서버에서 재검증한다(이 확인만 믿지 않는다).
export async function POST(request: NextRequest) {
  const auth = verifyAdmin(request);
  if (!auth.success) return auth.response;
  return NextResponse.json({ ok: true });
}
