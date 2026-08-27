// 시드 파싱에서 생긴 중복 품종을 하나로 합친다(예: "말벡" vs "말벡 (Malbec)").
// 중복(from)의 WineGrape 연결을 표준(to)으로 옮기고, 이미 같은 연결이 있으면
// 버린 뒤, 중복 Grape 행을 지운다. slug 기준이라 재실행해도 안전(멱등).
import { db } from "@/lib/db";

// { from: 지울 중복 slug, to: 남길 표준 slug }
const MERGES: { from: string; to: string }[] = [
  { from: "말벡-malbec", to: "malvec" },
  { from: "멀롯", to: "메를로" },
  { from: "카버네-소비뇽", to: "까베르네-소비뇽" },
  { from: "소비뇽블랑", to: "sauvignon-blanc" },
  { from: "시라-쉬라즈-syrah-shiraz", to: "쉬라즈" },
  { from: "푸르민트-furmint", to: "푸르민트" },
];

async function main() {
  for (const m of MERGES) {
    const from = await db.grape.findUnique({ where: { slug: m.from } });
    const to = await db.grape.findUnique({ where: { slug: m.to } });
    if (!from) {
      console.log(`= 이미 없음: ${m.from}`);
      continue;
    }
    if (!to) {
      console.log(`! 표준 없음, 건너뜀: ${m.to}`);
      continue;
    }
    const links = await db.wineGrape.findMany({ where: { grapeId: from.id } });
    let moved = 0;
    let dropped = 0;
    for (const link of links) {
      const exists = await db.wineGrape.findFirst({
        where: { wineId: link.wineId, grapeId: to.id },
      });
      if (exists) {
        await db.wineGrape.delete({ where: { id: link.id } });
        dropped += 1;
      } else {
        await db.wineGrape.update({ where: { id: link.id }, data: { grapeId: to.id } });
        moved += 1;
      }
    }
    await db.grape.delete({ where: { id: from.id } });
    console.log(`+ 병합: ${m.from} → ${m.to} (옮김 ${moved}, 중복제거 ${dropped})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
