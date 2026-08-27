import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { tastingNoteSchema, toUtcDate } from "@/features/journal/tasting-note-schema";
import { verifyAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

// 기존 시음 기록을 수정한다. 편집이므로 verifyAdmin으로 서버에서 다시 확인한다.
// 가격 수정은 이미 쌓인 시세 관측치를 건드리지 않는다(시세는 별도 이력).
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/tasting-notes/[id]">) {
  const auth = verifyAdmin(request);
  if (!auth.success) return auth.response;

  const { id } = await ctx.params;
  const existing = await db.tastingNote.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 기록입니다." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = tastingNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력이 올바르지 않습니다.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const wine = await db.wine.findUnique({ where: { id: d.wineId }, select: { id: true } });
  if (!wine) {
    return NextResponse.json({ error: "존재하지 않는 와인입니다." }, { status: 400 });
  }

  await db.tastingNote.update({
    where: { id },
    data: {
      wineId: d.wineId,
      drankOn: toUtcDate(d.drankOn) ?? null,
      purchasedOn: toUtcDate(d.purchasedOn) ?? null,
      vintageYear: d.vintageYear ?? null,
      purchasePrice: d.purchasePrice ?? null,
      purchasePlace: d.purchasePlace ?? null,
      rating: d.rating ?? null,
      bodyText: d.bodyText ?? null,
      foodPaired: d.foodPaired ?? null,
    },
  });

  return NextResponse.json({ id });
}

// 시음 기록을 삭제한다.
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/tasting-notes/[id]">) {
  const auth = verifyAdmin(request);
  if (!auth.success) return auth.response;

  const { id } = await ctx.params;
  await db.tastingNote.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
