// 홈 화면이 **언제** 저 혼자 움직이는지 잰다 — 자동 스월·와인 교체의 리듬 확인용.
//
// 캔버스를 연달아 찍어 앞 장과 얼마나 다른지 세고, 달라진 구간을 묶어 "몇 초에 한 번
// 움직이는가"로 보여 준다. glass-snapshot.mjs 가 "어떻게 보이나"(정지 화면)를 본다면
// 이쪽은 "언제 일어나나"(시간)를 본다.
//
// **해상도가 거칠다.** 헤드리스에서 한 장 찍는 데 3초쯤 걸려 1.4초짜리 스월 하나를
// 정확히 집어내지는 못한다. 간격이 맞는지(예: 18초마다) 보는 용도다. 파형과 스케줄
// 자체는 src/features/glass/auto-swirl.test.ts 가 숫자로 확인한다.
//
// 사용법 (dev 서버가 떠 있어야 한다): node scripts/swirl-timeline.mjs
//
// 헤드리스 WebGPU 는 깨져 있으므로 navigator.gpu 를 감춰 WebGL2 폴백으로 그린다
// (scripts/glass-snapshot.mjs 와 같은 이유).
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const BASE = "http://localhost:3000";
const STEP_MS = 0;
const RUN_MS = 40_000;
const TMP = path.join(process.cwd(), ".glass-snapshots", "timeline");

const { chromium } = await import("playwright");
fs.mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 260, height: 430 } });
await page.addInitScript(() => {
  Object.defineProperty(navigator, "gpu", { get: () => undefined });
});
const errors = [];
page.on("pageerror", (e) => {
  if (/Instance dropped in popErrorScope/.test(e.message)) return;
  errors.push(e.message.slice(0, 200));
});
await page.goto(BASE, { waitUntil: "networkidle", timeout: 45_000 });
const canvas = page.locator("canvas").first();
await canvas.waitFor();

const t0 = Date.now();
let prev = null;
const samples = [];
while (Date.now() - t0 < RUN_MS) {
  const file = path.join(TMP, "f.png");
  await canvas.screenshot({ path: file });
  const img = PNG.sync.read(fs.readFileSync(file));
  if (prev && prev.width === img.width && prev.height === img.height) {
    const diff = pixelmatch(prev.data, img.data, null, img.width, img.height, { threshold: 0.12 });
    samples.push({ t: (Date.now() - t0) / 1000, diff });
  }
  prev = img;
  await page.waitForTimeout(STEP_MS);
}
await browser.close();

// 움직임이 있는 구간을 묶어 "언제부터 언제까지 움직였나"로 출력한다.
const MOVING = 400; // 이 픽셀 수 넘게 바뀌면 움직인 것으로 본다
const bursts = [];
let cur = null;
for (const s of samples) {
  if (s.diff > MOVING) {
    if (!cur) cur = { from: s.t, to: s.t, peak: s.diff };
    else {
      cur.to = s.t;
      cur.peak = Math.max(cur.peak, s.diff);
    }
  } else if (cur && s.t - cur.to > 0.8) {
    bursts.push(cur);
    cur = null;
  }
}
if (cur) bursts.push(cur);

console.log(`표본 ${samples.length}개 · 페이지 오류 ${errors.length}건`);
if (errors.length) console.log(`  ${errors[0]}`);
console.log("\n움직인 구간:");
let last = null;
for (const b of bursts) {
  const gap = last == null ? "" : `  (앞 구간 끝나고 ${(b.from - last).toFixed(1)}초 뒤)`;
  console.log(
    `  ${b.from.toFixed(1)}s ~ ${b.to.toFixed(1)}s  (${(b.to - b.from).toFixed(1)}초, 최대 ${b.peak}px)${gap}`
  );
  last = b.to;
}
fs.rmSync(TMP, { recursive: true, force: true });
