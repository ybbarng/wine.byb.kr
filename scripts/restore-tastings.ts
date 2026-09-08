// 백업 JSON(backup/tasting-notes.json)에서 시음 기록을 되살린다.
//
// **없는 기록만 새로 넣고, 있는 기록은 절대 건드리지 않는다.** 이건 타협하지 않는다 —
// 시드가 사용자 데이터를 덮어써 리뷰가 유실된 사고가 있었다(docs/backup.md,
// scripts/add-tastings.ts 의 빈 칸만 채우기 규칙과 같은 이유).
// 그래서 이 스크립트는 서버가 통째로 날아갔을 때, 또는 지워진 기록을 되살릴 때만 값을 만든다.
//
// 와인은 slug 로 찾는다. 백업에 있는 와인이 DB 에 없으면 그 기록은 건너뛴다
// (와인은 시드가 만든다 — 먼저 배포해 도감을 채운 뒤 이 스크립트를 돌린다).
//
// 실행: pnpm exec tsx scripts/restore-tastings.ts            → 무엇을 할지 보여주기만 한다
//       pnpm exec tsx scripts/restore-tastings.ts --write    → 실제로 넣는다
import fs from "node:fs";
import path from "node:path";
import type { TastingBackupRow } from "@/features/journal/tasting-backup";
import { db } from "@/lib/db";

const IN_PATH = path.join(process.cwd(), "backup", "tasting-notes.json");

const toDate = (s: string | null): Date | null => (s ? new Date(`${s}T00:00:00.000Z`) : null);

async function main() {
  const write = process.argv.includes("--write");
  if (!fs.existsSync(IN_PATH)) {
    console.error(`백업 파일이 없다: ${IN_PATH}`);
    process.exit(1);
  }
  const rows: TastingBackupRow[] = JSON.parse(fs.readFileSync(IN_PATH, "utf8"));

  let restored = 0;
  let kept = 0;
  let missingWine = 0;

  for (const r of rows) {
    const exists = await db.tastingNote.findUnique({ where: { id: r.id }, select: { id: true } });
    if (exists) {
      kept += 1; // 이미 있다 → 손대지 않는다(덮어쓰기 금지)
      continue;
    }
    const wine = await db.wine.findUnique({ where: { slug: r.wineSlug }, select: { id: true } });
    if (!wine) {
      console.warn(`⚠️  와인 없음(건너뜀): ${r.wineSlug} — 기록 ${r.id}`);
      missingWine += 1;
      continue;
    }
    if (write) {
      await db.tastingNote.create({
        data: {
          id: r.id, // 원래 id 를 그대로 살려 두 번 복구해도 중복이 생기지 않게 한다
          wineId: wine.id,
          vintageYear: r.vintageYear,
          drankOn: toDate(r.drankOn),
          purchasedOn: toDate(r.purchasedOn),
          purchasePrice: r.purchasePrice,
          purchaseCurrency: r.purchaseCurrency,
          purchasePlace: r.purchasePlace,
          rating: r.rating,
          repurchase: r.repurchase,
          value: r.value,
          colorHex: r.colorHex,
          aromasConfirmed: r.aromasConfirmed,
          flavorFelt: r.flavorFelt,
          bodyText: r.bodyText,
          foodPaired: r.foodPaired,
          photos: r.photos,
          owner: r.owner,
          isPublic: r.isPublic,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        },
      });
    }
    restored += 1;
  }

  const head = write ? "복구 완료" : "미리보기(실제로 넣지 않음 — --write 를 붙여야 넣는다)";
  console.log(
    `🗄  ${head}: 되살림 ${restored}건 · 이미 있어 그대로 둠 ${kept}건` +
      (missingWine > 0 ? ` · 와인 없어 건너뜀 ${missingWine}건` : "")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
