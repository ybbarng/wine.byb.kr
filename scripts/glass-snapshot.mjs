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
//
// 헤드리스에선 WebGPU 를 감추고 WebGL2 폴백으로 그린다. 헤드리스 크로미움의 WebGPU 가
// `[Invalid Texture] ... CreateView` 로 깨져 잔이 아예 안 그려졌다(빈 배경만 찍혔고,
// 전/후 둘 다 비어 있으니 비교는 "차이 없음"으로 통과했다 — 안전망이 조용히 무력했다).
// 폴백 경로는 안드로이드 크롬이 실제로 쓰는 길이기도 하다.
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

/**
 * 잔이 안 그려졌는지 본다. 렌더가 실패하면 배경 한 가지 색만 남는다.
 * 잔이 있으면 유리 테두리·와인 때문에 밝기가 넓게 퍼진다.
 */
function isBlank(file) {
  const img = PNG.sync.read(fs.readFileSync(file));
  let min = 255;
  let max = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  return max - min < 20;
}

async function capture(label) {
  if (!label) throw new Error("라벨이 필요하다: capture <label>");
  const { chromium } = await import("playwright");
  fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--ignore-gpu-blocklist"],
  });
  let blank = 0;
  for (const p of PAGES) {
    const page = await browser.newPage({
      viewport: { width: 420, height: 560 },
      deviceScaleFactor: 2,
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "gpu", { get: () => undefined });
    });
    const errors = [];
    page.on("pageerror", (e) => {
      // 페이지를 닫을 때 WebGPU 정리 과정에서 나오는 무해한 경고는 거른다.
      if (/Instance dropped in popErrorScope/.test(e.message)) return;
      errors.push(e.message.slice(0, 200));
    });
    await page.goto(`${BASE}/wine/${p.slug}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForTimeout(SETTLE_MS);
    // 페이지 전체가 아니라 잔 캔버스만 찍는다 — 아래쪽 산지 지도가 매번 조금씩 달라
    // 잔 변화를 묻어버린다.
    const file = path.join(DIR, `${label}-${p.name}.png`);
    await page.locator("canvas").first().screenshot({ path: file });
    await page.close();
    const empty = isBlank(file);
    if (empty) blank++;
    console.log(
      `  ${p.name.padEnd(9)} 저장${empty ? " ⚠️ 잔이 안 그려졌다(단색)" : ""}${
        errors.length ? ` ⚠️ 페이지 오류 ${errors.length}건: ${errors[0]}` : ""
      }`
    );
  }
  await browser.close();
  if (blank > 0) {
    console.log(
      `\n❌ ${blank}장이 단색이다 — 잔이 안 그려졌으면 비교해봐야 항상 "차이 없음"이 나온다.`
    );
    process.exit(1);
  }
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
  // 자동 스월이 계속 돌아 수면이 완전히 멈추지 않는다. 같은 코드로 두 번 찍어도
  // 수면 가장자리에서 0.7% 쯤 어긋난다(잔만 잘라 찍으니 그 비중이 커졌다).
  // 실제로 바뀐 경우는 훨씬 크게 벌어지므로(잔 모양·색이 바뀌면 20% 이상) 2.5% 로 둔다.
  const LIMIT = 2.5;
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
