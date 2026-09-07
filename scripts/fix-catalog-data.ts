// 도감 데이터 정리(멱등). 조사 기반 교정이라 시드처럼 코드로 두고 배포 때 반영한다.
// - 비어 있던 와인 종류(type)를 채운다(전부 레드).
// - 스위트 디저트 와인을 dessert 로 재분류하고, 잔 색(colorHex)을 개별 지정한다.
//   디저트는 색이 황금~레드로 다양해 type 기본색 하나로는 안 맞기 때문이다
//   (wineGlassFor 가 colorHex 를 type 추정색보다 우선한다).
// - 시드에서 지저분하게 붙은 산지명을 정리한다.
// - 국가 수준으로만 묶여 있던 와인을 실제 세부 산지에 붙인다.
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
  await setType("bigios-moscato-passion-fruit", "dessert", "#ecd98f"); // 모스카토+패션프루트 옅은 황금
  await setType("tosti-moscato-black-edition-spumante", "dessert", "#ecdd8c"); // 모스카토 스푸만테 옅은 황금
  await setType("canti-estate-brachetto", "dessert", "#a8324a"); // 브라케토 밝은 체리레드

  // 3) 지저분한 산지명 정리(뿔리아 — 신퀀타·신퀀티나·까를로 사니 공용)
  await db.region
    .update({ where: { slug: "puglia" }, data: { nameKo: "뿔리아" } })
    .catch(() => console.warn("puglia 산지 없음(스킵)"));

  // 3-1) 산지 연결 정정 — 초기 CSV 임포트가 "프랑스"·"헝가리"처럼 국가 수준으로만
  //      묶어 둔 와인들을 실제 세부 산지에 붙인다. 산지 계층·지도뿐 아니라 가이드 시음의
  //      기후 안내도 세부 산지가 있어야 읽힌다(국가는 안에서 기후가 갈려 판단 보류).
  //      이름·등급으로 산지가 분명한 것만 고친다.
  for (const [wineSlug, regionSlug] of [
    ["primitivo-di-manduria", "puglia"], // 만두리아는 뿔리아의 마을. 산지가 아예 비어 있었다.
    ["ch-teau-saint-pierre", "bordeaux-saint-julien"], // 생줄리앙 4등급(notesKo에도 명시)
    ["patricius-tokaji-furmint", "헝가리-토카이"], // 이름부터 토카이. 자매 와인은 이미 연결됨
  ] as const) {
    const region = await db.region.findUnique({ where: { slug: regionSlug } });
    if (!region) {
      console.warn(`산지 없음(스킵): ${regionSlug}`);
      continue;
    }
    await db.wine
      .update({ where: { slug: wineSlug }, data: { regionId: region.id } })
      .catch(() => console.warn(`와인 없음(스킵): ${wineSlug}`));
  }

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
