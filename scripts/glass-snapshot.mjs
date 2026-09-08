// 와인잔 렌더 시각 회귀 확인 — 같은 기기에서 "변경 전/후"를 비교한다.
//
// 왜 필요한가: FluidLab.tsx 는 상단에 `@ts-nocheck` 가 있어(three/tsl 타입이 불완전)
// tsc 가 아무것도 잡지 못한다. 실제로 아직 쓰이는 상수를 지웠는데 타입체크가 통과하고,
// 화면을 봐야 런타임 오류로 드러난 적이 있다(2026-09-08). 이 파일을 고칠 땐 화면 대조가
// 사실상 유일한 안전망이다. docs/backup.md 가 아니라 이쪽은 렌더 회귀용.
//
// 커밋된 베이스라인을 쓰지 않는 이유: GPU·드라이버·OS 에 따라 렌더가 미세하게 달라
// 기기가 바뀌면 항상 실패한다. 대신 **지금 이 기기에서 전/후**를 비교한다.
//
// 사용법 (dev 서버가 떠 있어야 한다):
//   node scripts/glass-snapshot.mjs capture before   # 고치기 전
//   ... 코드 수정 ...
//   node scripts/glass-snapshot.mjs capture after
//   node scripts/glass-snapshot.mjs compare before after
//
// 스냅샷은 .glass-snapshots/ 에 쌓인다(gitignore).
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const DIR = path.join(process.cwd(), ".glass-snapshots");
const BASE = process.env.GLASS_SNAP_URL ?? "http://localhost:3000";
// 잔 종류가 다르면 형상·슬로싱 상수도 달라진다. 대표 셋을 함께 본다.
const PAGES = [
  { slug: "muga-reserva", name: "bordeaux" },
  { slug: "fattoria-dei-barbi-brunello-blue-label", name: "burgundy" },
  { slug: "domaine-laroche-chablis-saint-martin", name: "white" },
];
// 잔이 정착할 때까지. 슬로싱은 몇 초면 잦아든다.
const SETTLE_MS = 10_000;

async function capture(label) {
  if (!label) throw new Error("라벨이 필요하다: capture <label>");
  const { chromium } = await import("playwright");
  fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
  });
  for (const p of PAGES) {
    const page = await browser.newPage({
      viewport: { width: 420, height: 560 },
      deviceScaleFactor: 2,
    });
    const errors = [];
    page.on("pageerror", (e) => {
      // 페이지를 닫을 때 WebGPU 정리 과정에서 나오는 무해한 경고는 거른다.
      if (/Instance dropped in popErrorScope/.test(e.message)) return;
      errors.push(e.message.slice(0, 200));
    });
    await page.goto(`${BASE}/wine/${p.slug}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: path.join(DIR, `${label}-${p.name}.png`) });
    await page.close();
    console.log(
      `  ${p.name.padEnd(9)} 저장${errors.length ? ` ⚠️ 페이지 오류 ${errors.length}건: ${errors[0]}` : ""}`
    );
  }
  await browser.close();
  console.log(`스냅샷 "${label}" 완료 → ${path.relative(process.cwd(), DIR)}/`);
}

function compare(a, b) {
  if (!a || !b) throw new Error("라벨 둘이 필요하다: compare <before> <after>");
  let worst = 0;
  for (const p of PAGES) {
    const fa = path.join(DIR, `${a}-${p.name}.png`);
    const fb = path.join(DIR, `${b}-${p.name}.png`);
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) {
      console.log(`  ${p.name.padEnd(9)} 건너뜀(스냅샷 없음)`);
      continue;
    }
    const ia = PNG.sync.read(fs.readFileSync(fa));
    const ib = PNG.sync.read(fs.readFileSync(fb));
    if (ia.width !== ib.width || ia.height !== ib.height) {
      console.log(`  ${p.name.padEnd(9)} 크기 다름 — 비교 불가`);
      worst = 100;
      continue;
    }
    const diff = new PNG({ width: ia.width, height: ia.height });
    // threshold: 픽셀 하나를 "다르다"고 볼 민감도. GPU 미세 차이를 흡수한다.
    const changed = pixelmatch(ia.data, ib.data, diff.data, ia.width, ia.height, {
      threshold: 0.12,
    });
    const pct = (changed / (ia.width * ia.height)) * 100;
    worst = Math.max(worst, pct);
    const out = path.join(DIR, `diff-${a}-${b}-${p.name}.png`);
    fs.writeFileSync(out, PNG.sync.write(diff));
    console.log(`  ${p.name.padEnd(9)} 다른 픽셀 ${pct.toFixed(2)}%  → ${path.basename(out)}`);
  }
  // 슬로싱이 완전히 0 은 아니라 미세한 흔들림이 남는다. 1% 를 넘으면 사람이 볼 것.
  const LIMIT = 1.0;
  if (worst > LIMIT) {
    console.log(`\n❌ 최대 ${worst.toFixed(2)}% 가 ${LIMIT}% 를 넘었다 — diff 이미지를 확인할 것.`);
    process.exit(1);
  }
  console.log(`\n✅ 최대 ${worst.toFixed(2)}% — 렌더 차이 없음으로 본다(기준 ${LIMIT}%).`);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "capture") await capture(args[0]);
  else if (cmd === "compare") compare(args[0], args[1]);
  else {
    console.log(
      "사용법:\n  node scripts/glass-snapshot.mjs capture <label>\n  node scripts/glass-snapshot.mjs compare <before> <after>"
    );
    process.exit(1);
  }
} catch (e) {
  console.error("실패:", e.message);
  process.exit(1);
}
