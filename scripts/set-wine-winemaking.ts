// 와인별 양조 기법(Wine.winemaking)을 slug 기준으로 채운다.
//
// 왜 따로 두나: 빵·브리오슈는 포도가 아니라 **효모 앙금과 오래 숙성해서** 생기고,
// 건포도 같은 졸인 단 향은 **포도를 말려서** 생긴다. 품종 아로마에 섞어 두면 그 기법을
// 안 쓴 와인에도 그 향이 뜬다. 오크(바닐라·토스트)를 `Wine.oakAging` 으로 뺀 것과 같다.
// 실제로 "빵"이 피노뫼니에 품종에 붙어 있었고, 이 작업으로 떼어냈다.
//
// **확신이 없으면 아예 안 적는다** → null 로 남고 가이드는 양조 얘기를 하지 않는다.
// 근거는 각 와인의 notesKo 서술과 그 카테고리의 양조 관행을 함께 봤다.
//
// 멱등: 값이 같으면 건너뛴다. 없는 와인·모르는 태그는 실패로 끝낸다(조용히 넘어가면
// 배포 로그가 성공처럼 보이고 값은 안 들어간다).
// 실행: pnpm exec tsx scripts/set-wine-winemaking.ts
import { serializeWinemaking, type WinemakingTag } from "@/features/wine/winemaking";
import { db } from "@/lib/db";

const WINEMAKING: Record<string, WinemakingTag[]> = {
  // ── 전통방식 스파클링 — 병 안에서 효모와 함께 오래 둔다(리 숙성) ──
  // 빵·브리오슈·비스킷 향의 출처. 이게 없으면 그 향을 설명할 근거가 없다.
  "alain-bailly-cuv-e-p-tronille": ["lees"], // notesKo: 3년 넘게 효모와 숙성, 갓 구운 빵·브리오슈
  "gosset-grand-rose-brut": ["lees"], // 샴페인(전통방식). 고세는 리 숙성이 긴 하우스다
  "vranken-pommery-brut-nature": ["lees"], // notesKo: 빵 향
  "marques-de-monistrol-cava-brut": ["lees"], // notesKo: 전통방식, 은은한 빵 효모 향

  // 브라운 브라더스 프리미엄 뀌베는 탱크(샤르마) 방식으로 알려져 있어 리 숙성 향이
  // 앞서지 않는다. notesKo 도 사과·시트러스 중심이라 적지 않는다(모르면 말 안 함).

  // ── 포도를 말려 담근 와인 ──
  "aprimondo-appassimento-sangiovese-rubicone": ["appassimento"], // 이름·notesKo 모두 아파시멘토
};

async function main() {
  let changed = 0;
  const problems: string[] = [];

  for (const [slug, tags] of Object.entries(WINEMAKING)) {
    const wine = await db.wine.findUnique({
      where: { slug },
      select: { id: true, nameKo: true, winemaking: true },
    });
    if (!wine) {
      problems.push(`와인 없음: ${slug}`);
      continue;
    }
    const next = serializeWinemaking(tags);
    if (next == null) {
      problems.push(`${slug}: 알 수 없는 태그만 적혀 있다 — ${tags.join(", ")}`);
      continue;
    }
    if (wine.winemaking === next) continue; // 멱등
    await db.wine.update({ where: { id: wine.id }, data: { winemaking: next } });
    console.log(`+ ${wine.nameKo} · ${wine.winemaking ?? "없음"} → ${next}`);
    changed++;
  }

  console.log(changed === 0 ? "= 바뀐 양조 정보 없음" : `\n양조 정보 ${changed}건 갱신`);

  if (problems.length > 0) {
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
