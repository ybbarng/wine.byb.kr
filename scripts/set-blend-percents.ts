// 블렌드 비율을 채운다 — 가이드 시음이 "주 품종"을 무엇으로 볼지 정하는 근거다.
//
// 왜 필요한가: `features/wine/blend.ts` 는 비율을 모르면 **저장된 순서의 첫 품종**을 주
// 품종으로 본다. 비율이 없으면 그 순서 하나에 예상이 통째로 걸리는데, 반피 첸티네는
// 실제로 메를로가 먼저 저장돼 있어 산지오베제 60% 와인이 메를로 와인으로 읽혔다.
// (딸보는 저장 순서는 맞았지만 정렬이 흔들렸다 — queries.ts 의 2차 정렬 키 참고.)
//
// **확인된 것만 넣는다.** 자료가 갈리거나 못 찾은 와인은 손대지 않고 아래 UNVERIFIED 에
// 적어 둔다. 비율을 지어내면 예상이 조용히 틀리고, 틀린 줄도 모르게 된다.
//
// 멱등하다 — 이미 같은 값이면 건너뛴다. 배포마다 돌아도 안전하다.
import { matchGrape } from "@/features/wine/grape-name";
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
    // ⚠️ 이건 **그해 블렌드가 아니라 식재 비율(플랜팅)** 이다. 빈티지마다 블렌드가
    // 달라지는데 우리 기록엔 빈티지가 없어 밭 구성을 대신 쓴다. 까베르네 프랑은
    // 2007년 이후 블렌드에서 빠졌지만 밭에는 1.5% 남아 있어 네 품종을 그대로 둔다 —
    // 어차피 문턱 아래라 곁들임으로 떨어진다. 빈티지를 적게 되면 그해 값으로 바꿀 것.
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
    // 저장 순서가 실제로 메를로 먼저라 메를로 와인으로 읽히고 있었다. 산지오베제 와인이다.
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
  const problems: string[] = [];

  for (const b of BLENDS) {
    const wine = await db.wine.findUnique({
      where: { slug: b.wineSlug },
      select: {
        id: true,
        nameKo: true,
        grapes: { select: { id: true, percent: true, grape: { select: { nameKo: true } } } },
      },
    });
    if (!wine) {
      problems.push(`와인 없음: ${b.wineSlug}`);
      continue;
    }

    // 이 와인에 걸린 품종 링크 안에서만 찾는다. **정확히 일치로 찾지 않는다** —
    // DB 품종명은 표기가 흔들려(까/카, 띄어쓰기) 정확 일치는 조용히 빗나간다
    // (features/wine/grape-name.ts 의 규칙).
    const updates: { id: string; percent: number; label: string; before: number | null }[] = [];
    for (const [grapeName, percent] of Object.entries(b.percents)) {
      const link = matchGrape(
        grapeName,
        wine.grapes.map((g) => [[g.grape.nameKo], g] as const)
      );
      if (!link) {
        problems.push(`${wine.nameKo}: 품종 링크 없음 — ${grapeName}`);
        continue;
      }
      if (link.percent === percent) continue; // 멱등
      updates.push({
        id: link.id,
        percent,
        label: `${wine.nameKo} · ${link.grape.nameKo}`,
        before: link.percent,
      });
    }

    // 적어 두지 않은 품종이 남아 있으면 그것만 비율 null 이 되어 자동으로 곁들임으로
    // 강등된다. 조용히 예상이 바뀌므로 알린다.
    const named = new Set(
      wine.grapes
        .filter((g) =>
          matchGrape(
            g.grape.nameKo,
            Object.keys(b.percents).map((n) => [[n], true] as const)
          )
        )
        .map((g) => g.id)
    );
    const unlisted = wine.grapes.filter((g) => !named.has(g.id)).map((g) => g.grape.nameKo);
    if (unlisted.length > 0) {
      problems.push(`${wine.nameKo}: 비율을 안 적은 품종이 있다 — ${unlisted.join(", ")}`);
    }

    // 와인 하나는 통째로 반영한다. 중간에 끊기면 일부만 비율이 생겨, 나머지가
    // 곁들임으로 강등된 채 남는다(blend.ts 는 하나라도 비율이 있으면 비율 모드로 간다).
    if (updates.length > 0) {
      await db.$transaction(
        updates.map((u) =>
          db.wineGrape.update({ where: { id: u.id }, data: { percent: u.percent } })
        )
      );
      for (const u of updates) {
        console.log(`+ ${u.label} ${u.before ?? "없음"} → ${u.percent}%`);
        changed++;
      }
    }
  }

  console.log(changed === 0 ? "= 바뀐 비율 없음" : `\n비율 ${changed}건 갱신`);
  console.log(`\n비율 미확인 ${UNVERIFIED.length}종(순서에 기대는 중):`);
  for (const u of UNVERIFIED) console.log(`  · ${u}`);

  if (problems.length > 0) {
    // 조용히 넘어가면 배포 로그가 성공처럼 보이고 비율은 안 들어간다. 배포 스크립트의
    // `|| echo "⚠️"` 가 걸리도록 실패로 끝낸다.
    console.error(`\n❌ 확인 필요 ${problems.length}건:`);
    for (const m of problems) console.error(`  · ${m}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
