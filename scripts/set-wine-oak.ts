// 와인별 오크 숙성 정도(Wine.oakAging)를 slug 기준으로 채운다.
//
// 왜 따로 두나: 바닐라·토스트·훈연 같은 향은 품종이 아니라 **양조(배럴)**에서 온다.
// 품종 아로마에 섞어 두면 오크를 안 쓴 와인(예: 샤블리)에도 "버터·오크"가 떠서
// 가이드가 틀린 말을 하게 된다. 그래서 와인마다 오크 여부를 따로 적어 둔다.
//
// 값: none(안 쓰거나 거의 안 씀) · light(쓰되 과실이 주인공) · heavy(오크가 뚜렷).
// 확신이 없으면 아예 넣지 않는다 → null 로 남고 가이드는 오크 얘기를 하지 않는다.
//
// 근거는 각 와인의 notesKo 서술(“오크를 안 써서”, “미국 오크 숙성” 등)과 등급·양조
// 관행을 함께 봤다. 판단이 갈릴 수 있는 값이라 근거를 주석으로 남긴다.
//
// 멱등: 존재하는 와인의 oakAging 만 update 한다(다른 칸은 안 건드림).
// 실행: pnpm exec tsx scripts/set-wine-oak.ts
import { db } from "@/lib/db";

type Oak = "none" | "light" | "heavy";

const OAK: Record<string, Oak> = {
  // ── 샴페인 — 향의 고소함은 오크가 아니라 효모(리) 숙성에서 온다 ──
  "alain-bailly-cuv-e-p-tronille": "none", // notesKo: 3년 효모 숙성(브리오슈) — 오크 아님
  "gosset-grand-rose-brut": "none",
  "vranken-pommery-brut-nature": "none", // notesKo: 빵껍질 = 리 숙성

  // ── 디저트/모스카토 — 신선한 과실·꽃 향이 핵심이라 오크를 쓰지 않는다 ──
  "bigios-moscato-passion-fruit": "none",
  "canti-estate-brachetto": "none",
  "fontanafredda-le-fronde-brachetto-dacqui": "none",
  "patricius-tokaji-late-harvest-katinka": "none", // 늦수확 라인, 아수와 달리 오크 숙성 안 함
  "tosti-moscato-black-edition-spumante": "none",
  "tosti-moscato-d-asti": "none",

  // ── 레드 ──
  "alta-vista-premium-malbec": "light", // notesKo: 삼나무·초콜릿·연기 뉘앙스
  "aprimondo-appassimento-sangiovese-rubicone": "light", // notesKo: 바닐라·볶은 단내
  "banfi-centine": "light", // notesKo: 바닐라
  "bel-air-bordeaux-2023": "none", // 엔트리 AOC 보르도, 탱크 숙성 중심
  "carlo-sani-susumaniello": "none", // notesKo가 과실·산미 중심, 오크 흔적 없음
  "carmel-road-pinot-noir": "light", // notesKo: 살짝 볶은 오크
  "carpineto-chianti-classico-riserva-2019": "heavy", // 리제르바 장기 숙성, notesKo: 연필심
  "casillero-del-diablo-cabernet-sauvignon": "light", // notesKo: 오크에서 온 바닐라·커피·삼나무
  "ch-teau-saint-pierre": "heavy", // 생줄리앙 4등급, notesKo: 초콜릿·감초·연필심
  "ch-teau-talbot": "heavy", // 생줄리앙 4등급, notesKo: 삼나무·연필심·담뱃잎
  "chateau-pey-la-tour-reserve": "light", // notesKo: 오크 숙성에서 온 감초
  "cinquanta-collezione": "light", // notesKo: 초콜릿·감초·바닐라
  cinquantina: "light", // 같은 생산자(산 마르짜노)의 같은 계열
  "duckhorn-decoy-merlot": "light", // notesKo: 모카·다크초콜릿·베이킹 스파이스
  "esterhazy-klimt-red": "light", // notesKo: 코코아·달큰한 향신료
  "farmers-leap-the-brave-shiraz": "light", // notesKo: 달곰한 오크 뉘앙스
  "fattoria-dei-barbi-brunello-blue-label": "heavy", // 브루넬로 규정상 장기 오크 숙성
  "g-rard-bertrand-ch-teau-lhospitalet-la-r-serve": "light",
  "luigi-baudana-langhe-rosso": "none", // notesKo: 색이 맑고 옅음, 과실·산미 중심
  "marqu-s-de-casa-concha-blue": "heavy", // 프렌치 오크 장기 숙성 라인
  "mmm-malbec": "light",
  "mmm-pinotage": "light", // notesKo의 훈연은 품종 특성으로 서술됨 — 오크는 거들 정도
  "montgras-intriga-maxima": "heavy", // 마이포 알토 아이콘 까베르네
  "muga-reserva": "heavy", // notesKo: 프랑스·미국 오크 24개월
  "pesquera-crianza": "heavy", // notesKo: 바닐라·훈연은 미국 오크 숙성에서
  "precision-navigator-zinfandel": "light",
  "primitivo-di-manduria": "light",
  "pyros-vineyard-block-n4-malbec-2022": "light",
  "vidal-fleury-saint-joseph-rouge": "light", // 북부 론 시라, 오크 숙성
  "viu-manent-single-vineyard-malbec": "light", // notesKo: 헤이즐넛 같은 고소함

  // ── 로제·스파클링 — 신선함이 핵심, 스테인리스 ──
  "maison-castel-merlot-ros": "none",
  "brown-brothers-premium-cuvee": "none",
  "marques-de-monistrol-cava-brut": "none", // 카바는 스테인리스 발효

  // ── 화이트 ──
  "bonterra-sauvignon-blanc": "none",
  "domaine-des-hardieres-anjou-blanc": "none", // notesKo: 산미·미네랄 중심
  "domaine-laroche-chablis-saint-martin": "none", // notesKo: 오크는 거의 안 쓴 대신 리 숙성
  "domaine-vincent-prunier-bourgogne-chardonnay": "light", // notesKo: 오크통 숙성, 나무·바닐라
  "e-guigal-c-tes-du-rh-ne-blanc": "none", // notesKo: 오크를 안 써서 과실이 깔끔
  "errazuriz-aconcagua-costa-chardonnay": "none", // notesKo: 버터·바닐라 가득한 스타일과 결이 다름
  "grove-mill-pinot-gris": "none",
  "henri-bourgeois-sancerre-les-baronnes": "none", // notesKo: 오크를 안 쓴 스테인리스 발효
  lovely: "none",
  "luigi-baudana-langhe-bianco": "none", // notesKo: 생기 있는 산미·과즙 중심
  "mansion-house-bay-sauvignon-blanc": "none", // notesKo: 오크를 안 써 과실 향이 그대로
  "mmm-riesling": "none",
  "palliser-estate-sauvignon-blanc": "none",
  "patricius-tokaji-furmint": "none", // 드라이 푸르민트, 스테인리스
  "pikes-clare-valley-riesling": "none",
  "spy-valley-sauvignon-blanc": "none",
  "te-henga-sauvignon-blanc-2025": "none",
};

async function main() {
  let updated = 0;
  let missing = 0;
  for (const [slug, oakAging] of Object.entries(OAK)) {
    const wine = await db.wine.findUnique({ where: { slug }, select: { id: true } });
    if (!wine) {
      console.warn(`⚠️  없는 와인 건너뜀: ${slug}`);
      missing += 1;
      continue;
    }
    await db.wine.update({ where: { slug }, data: { oakAging } });
    updated += 1;
  }
  const total = await db.wine.count();
  const known = await db.wine.count({ where: { oakAging: { not: null } } });
  console.log(`🛢  오크 정보 ${updated}종 반영 (없는 slug ${missing}종)`);
  console.log(`   전체 ${total}종 중 ${known}종에 오크 정보 있음`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
