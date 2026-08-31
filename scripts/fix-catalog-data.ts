// 도감 데이터 정리(멱등). 조사 기반 교정이라 시드처럼 코드로 두고 배포 때 반영한다.
// - 비어 있던 와인 종류(type)를 채운다(전부 레드).
// - 스위트 디저트 와인을 dessert 로 재분류하고, 잔 색(colorHex)을 개별 지정한다.
//   디저트는 색이 황금~레드로 다양해 type 기본색 하나로는 안 맞기 때문이다
//   (wineGlassFor 가 colorHex 를 type 추정색보다 우선한다).
// - 시드에서 지저분하게 붙은 산지명을 정리한다.
// - 에스터하지 클림트 레드 블렌드를 보강한다(블라우프랭키슈·메를로 추가).
//
// 실행: pnpm exec tsx scripts/fix-catalog-data.ts
import { db } from "@/lib/db";

async function setType(slug: string, type: string, colorHex?: string) {
  const w = await db.wine.findUnique({ where: { slug }, select: { id: true } });
  if (!w) {
    console.warn(`와인 없음(스킵): ${slug}`);
    return;
  }
  await db.wine.update({
    where: { slug },
    data: colorHex ? { type, colorHex } : { type },
  });
}

async function main() {
  // 1) 종류가 비어 있던 레드들
  for (const slug of [
    "primitivo-di-manduria",
    "mmm-pinotage",
    "marqu-s-de-casa-concha-blue",
    "viu-manent-single-vineyard-malbec",
  ]) {
    await setType(slug, "red");
  }

  // 2) 스위트 디저트 와인 → dessert + 실제 색(colorHex)
  await setType("tosti-moscato-d-asti", "dessert", "#e8d98a"); // 옅은 황금(약발포 스위트)
  await setType("patricius-tokaji-late-harvest-katinka", "dessert", "#d9a63c"); // 늦수확 호박빛
  await setType("fontanafredda-le-fronde-brachetto-dacqui", "dessert", "#a8324a"); // 브라케토 밝은 체리레드

  // 3) 지저분한 산지명 정리(뿔리아 — 신퀀타·신퀀티나·까를로 사니 공용)
  await db.region
    .update({ where: { slug: "puglia" }, data: { nameKo: "뿔리아" } })
    .catch(() => console.warn("puglia 산지 없음(스킵)"));

  // 4) 에스터하지 클림트 레드 = 블라우프랭키슈 + 츠바이겔트 + 메를로 블렌드.
  //    츠바이겔트만 연결돼 있던 것을 보강한다(비율은 빈티지마다 달라 percent 는 두지 않음).
  const bf = await db.grape.upsert({
    where: { slug: "blaufrankisch" },
    update: {},
    create: {
      slug: "blaufrankisch",
      nameKo: "블라우프랭키슈",
      nameLocal: "Blaufränkisch",
      aliases: JSON.stringify([
        "블라우프렌키슈",
        "렘베르거",
        "케크프랑코시",
        "Lemberger",
        "Kékfrankos",
      ]),
      color: "red",
    },
  });
  const merlot = await db.grape.findUnique({ where: { slug: "메를로" }, select: { id: true } });
  const wine = await db.wine.findUnique({
    where: { slug: "esterhazy-klimt-red" },
    select: { id: true },
  });
  if (wine) {
    for (const g of [bf, merlot]) {
      if (!g) continue;
      const has = await db.wineGrape.findFirst({
        where: { wineId: wine.id, grapeId: g.id },
      });
      if (!has) await db.wineGrape.create({ data: { wineId: wine.id, grapeId: g.id } });
    }
  } else {
    console.warn("에스터하지 클림트 레드 와인 없음(스킵)");
  }

  console.log("도감 데이터 정리 완료.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
