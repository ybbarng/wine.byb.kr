// 블렌드 비율을 채운다 — 가이드 시음이 "주 품종"을 무엇으로 볼지 정하는 근거다.
//
// 왜 필요한가: `features/wine/blend.ts` 는 비율을 모르면 **저장된 순서의 첫 품종**을 주
// 품종으로 본다. 그런데 그 순서가 항상 맞지 않았다 — 샤또 딸보가 메를로 주도로, 반피
// 첸티네가 메를로 주도로 잡혀 향·맛 예상이 통째로 틀어져 있었다.
//
// **확인된 것만 넣는다.** 자료가 갈리거나 못 찾은 와인은 손대지 않고 아래 UNVERIFIED 에
// 적어 둔다. 비율을 지어내면 예상이 조용히 틀리고, 틀린 줄도 모르게 된다.
//
// 멱등하다 — 이미 같은 값이면 건너뛴다. 배포마다 돌아도 안전하다.
import { db } from "@/lib/db";

type BlendSeed = {
  wineSlug: string;
  /** 왜 이 값인지 — 다음 사람이 근거를 다시 찾지 않아도 되게 남긴다. */
  source: string;
  /** 품종 한국어 이름 → 비율(%). 합이 100 이 아니어도 된다(반올림·소수 품종). */
  percents: Record<string, number>;
};

const BLENDS: BlendSeed[] = [
  {
    wineSlug: "ch-teau-talbot",
    // 샤또가 밝히는 식재 비율(플랜팅). 빈티지마다 조금씩 달라 그해 블렌드가 아니라
    // 밭 구성을 쓴다 — 우리 기록엔 빈티지가 없다. 까베르네 프랑은 2007년 이후 블렌드
    // 에서 빠졌지만 밭에는 남아 있어(1.5%) 네 품종을 그대로 둔다.
    source: "생줄리앙 4등급. 식재 67% 까쇼 / 27% 메를로 / 4.5% 쁘띠 베르도 / 1.5% 까베르네 프랑",
    percents: {
      "까베르네 소비뇽": 67,
      메를로: 27,
      "쁘띠 베르도": 4.5,
      "까베르네 프랑": 1.5,
    },
  },
  {
    wineSlug: "banfi-centine",
    // 저장 순서가 메를로 먼저라 메를로 와인으로 읽히고 있었다. 산지오베제 와인이다.
    source: "반피가 밝히는 기본 배합 60% 산지오베제 / 20% 까쇼 / 20% 메를로",
    percents: { 산지오베제: 60, "까베르네 소비뇽": 20, 메를로: 20 },
  },
  {
    wineSlug: "carpineto-chianti-classico-riserva-2019",
    // 순서는 이미 맞았지만(산지오베제 먼저) 값을 적어 두면 순서에 기대지 않게 된다.
    source: "Vinous 가 여러 빈티지에 걸쳐 적는 90% 산지오베제 / 10% 카나이올로",
    percents: { 산지오베제: 90, 카나이올로: 10 },
  },
];

/**
 * 비율을 못 채운 블렌드 — 순서에 기대고 있다.
 * 순서가 통상과 어긋나 보이면 여기부터 의심할 것.
 */
const UNVERIFIED = [
  "esterhazy-klimt-red: 자료가 갈린다(SAQ 2023 은 블라우프랭키슈 70/메를로 25/까쇼 5 로 츠바이겔트가 아예 없다). 우리 DB 는 츠바이겔트 주도로 저장돼 있어 **틀렸을 가능성이 높다.** 라벨·수입사 자료로 다시 확인할 것.",
  "bel-air-bordeaux-2023: 메를로 주도로 저장. 일반 보르도는 통상 메를로 주도라 그럴듯하지만 확인 못 함.",
  "lovely: 소비뇽 블랑 주도로 저장. 스타일상 그럴듯하지만 확인 못 함.",
  "marques-de-monistrol-cava-brut: 마카베오 주도로 저장. 카바 통상 배합과 맞지만 확인 못 함.",
];

async function main() {
  let changed = 0;
  for (const b of BLENDS) {
    const wine = await db.wine.findUnique({
      where: { slug: b.wineSlug },
      select: { id: true, nameKo: true },
    });
    if (!wine) {
      console.log(`? 와인 없음: ${b.wineSlug}`);
      continue;
    }
    for (const [grapeName, percent] of Object.entries(b.percents)) {
      const grape = await db.grape.findFirst({ where: { nameKo: grapeName } });
      if (!grape) {
        console.log(`? 품종 없음: ${grapeName} (${b.wineSlug})`);
        continue;
      }
      const link = await db.wineGrape.findFirst({
        where: { wineId: wine.id, grapeId: grape.id },
      });
      if (!link) {
        console.log(`? 연결 없음: ${wine.nameKo} - ${grapeName}`);
        continue;
      }
      if (link.percent === percent) continue; // 멱등
      await db.wineGrape.update({ where: { id: link.id }, data: { percent } });
      console.log(`+ ${wine.nameKo} · ${grapeName} ${link.percent ?? "없음"} → ${percent}%`);
      changed++;
    }
  }
  console.log(changed === 0 ? "= 바뀐 비율 없음" : `\n비율 ${changed}건 갱신`);
  console.log(`\n비율 미확인 ${UNVERIFIED.length}종(순서에 기대는 중):`);
  for (const u of UNVERIFIED) console.log(`  · ${u}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
