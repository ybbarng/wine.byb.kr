import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  serializeAromas,
  serializeFlavor,
  tastingNoteSchema,
  toUtcDate,
} from "@/features/journal/tasting-note-schema";
import { verifyAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

// 새 시음 기록을 만든다. 편집이므로 verifyAdmin으로 서버에서 다시 확인한다.
export async function POST(request: NextRequest) {
  const auth = verifyAdmin(request);
  if (!auth.success) return auth.response;

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

  const drankOn = toUtcDate(d.drankOn) ?? null;
  const purchasedOn = toUtcDate(d.purchasedOn) ?? null;

  const note = await db.tastingNote.create({
    data: {
      wineId: d.wineId,
      drankOn,
      purchasedOn,
      vintageYear: d.vintageYear ?? null,
      purchasePrice: d.purchasePrice ?? null,
      purchasePlace: d.purchasePlace ?? null,
      rating: d.rating ?? null,
      repurchase: d.repurchase ?? null,
      value: d.value ?? null,
      colorHex: d.colorHex ?? null,
      aromasConfirmed: serializeAromas(d.aromasConfirmed),
      flavorFelt: serializeFlavor(d.flavorFelt),
      bodyText: d.bodyText ?? null,
      foodPaired: d.foodPaired ?? null,
      owner: "admin",
      isPublic: true,
    },
  });

  // 구매 가격이 있으면 시세 관측치로도 한 건 남긴다(§6.2).
  if (d.purchasePrice != null) {
    await db.priceObservation.create({
      data: {
        wineId: d.wineId,
        vintageYear: d.vintageYear ?? null,
        price: d.purchasePrice,
        source: "purchase",
        observedOn: purchasedOn ?? drankOn,
      },
    });
  }

  return NextResponse.json({ id: note.id }, { status: 201 });
}
