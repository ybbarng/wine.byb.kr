// 기존 국가 지역에 좌표만 채운다(데이터 보존형). 시음 기록은 건드리지 않는다.
// 서버에서 시드 전체를 다시 돌리지 않고 좌표만 반영할 때 쓴다:
//   pnpm exec tsx scripts/apply-region-coords.ts

import { db } from "@/lib/db";
import { countryCoord } from "./lib/region-coords";

async function main() {
  const countries = await db.region.findMany({ where: { level: "country" } });
  let updated = 0;
  for (const r of countries) {
    const c = r.country ? countryCoord(r.country) : null;
    if (!c) continue;
    await db.region.update({
      where: { id: r.id },
      data: { latitude: c.lat, longitude: c.lng },
    });
    updated++;
  }
  console.log(`좌표 반영: ${updated}개 국가 지역`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
