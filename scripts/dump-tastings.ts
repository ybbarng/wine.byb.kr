// 시음 기록을 저장소에 커밋할 JSON 으로 덤프한다.
//
// 왜: 시음 기록은 앱으로만 들어가 서버 DB 에만 있는, 다시 만들 수 없는 데이터다.
// 도감 정보(와인·산지·품종·오크)는 전부 git 시드에 있어 배포 한 번이면 되살아나지만
// 별점·감상·관측한 색·맡은 향·느낀 맛은 그렇지 않다. docs/backup.md 참고.
//
// 형식·정렬 규칙은 src/features/journal/tasting-backup.ts 에 있다(테스트로 고정).
// 같은 데이터면 항상 같은 파일이 나오므로, 안 바뀐 날엔 diff 가 비어 헛커밋이 없다.
//
// 실행: pnpm exec tsx scripts/dump-tastings.ts          → backup/tasting-notes.json 에 쓴다
//       pnpm exec tsx scripts/dump-tastings.ts --stdout → 파일 대신 표준출력으로(원격 수집용)
import fs from "node:fs";
import path from "node:path";
import { serializeBackup, toBackupRows } from "@/features/journal/tasting-backup";
import { db } from "@/lib/db";

const OUT_PATH = path.join(process.cwd(), "backup", "tasting-notes.json");

async function main() {
  const toStdout = process.argv.includes("--stdout");

  // isPublic 여부와 무관하게 전부 담는다 — 백업은 화면에 보이는 것이 아니라
  // "잃으면 안 되는 것"이 기준이다.
  const notes = await db.tastingNote.findMany({
    include: { wine: { select: { slug: true } } },
  });
  const text = serializeBackup(toBackupRows(notes));

  if (toStdout) {
    process.stdout.write(text);
    return;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const before = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, "utf8") : null;
  fs.writeFileSync(OUT_PATH, text);
  const changed = before !== text;
  console.log(
    `🗄  시음 기록 ${notes.length}건 → ${path.relative(process.cwd(), OUT_PATH)}` +
      (changed ? " (내용 바뀜)" : " (변화 없음)")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
