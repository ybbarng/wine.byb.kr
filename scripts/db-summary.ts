// 읽기 전용 DB 요약 — 어느 환경에서든 현재 상태·충돌 점검용.
import { db } from "@/lib/db";

async function main() {
  const [wines, notes, regions, grapes, producers] = await Promise.all([
    db.wine.count(),
    db.tastingNote.count(),
    db.region.count(),
    db.grape.count(),
    db.producer.count(),
  ]);
  console.log(
    `wines=${wines} notes=${notes} regions=${regions} grapes=${grapes} producers=${producers}`
  );

  const recent = await db.tastingNote.findMany({
    where: { drankOn: { gt: new Date("2025-08-31") } },
    orderBy: { drankOn: "asc" },
    include: { wine: { select: { nameLocal: true, nameKo: true } } },
  });
  console.log(`\n2025-08-31 이후 기록: ${recent.length}건`);
  for (const n of recent) {
    const d = n.drankOn?.toISOString().slice(0, 10) ?? "?";
    console.log(`  ${d}  ${n.wine.nameLocal ?? n.wine.nameKo}  ${n.purchasePrice ?? ""}`);
  }

  // 내가 참조하는 기존 slug 들이 서버에 있는지(없으면 seed 실행 시 그 항목만 실패).
  const need = {
    regions: [
      "france",
      "italy",
      "chile",
      "spain",
      "piemonte",
      "maipo-valley",
      "australia",
      "샹파뉴",
    ],
    grapes: ["sauvignon-blanc", "메를로", "까베르네-소비뇽", "무스캇", "샤르도네", "산지오베제"],
  };
  const haveR = new Set(
    (
      await db.region.findMany({ where: { slug: { in: need.regions } }, select: { slug: true } })
    ).map((r) => r.slug)
  );
  const haveG = new Set(
    (await db.grape.findMany({ where: { slug: { in: need.grapes } }, select: { slug: true } })).map(
      (g) => g.slug
    )
  );
  console.log(
    "\n참조 산지 없음:",
    need.regions.filter((s) => !haveR.has(s)).join(", ") || "(없음, 전부 있음)"
  );
  console.log(
    "참조 품종 없음:",
    need.grapes.filter((s) => !haveG.has(s)).join(", ") || "(없음, 전부 있음)"
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
