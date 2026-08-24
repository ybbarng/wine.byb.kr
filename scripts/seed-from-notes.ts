// 기존 손글 노트(data/seed)를 DB로 옮기는 일회성 시드 스크립트.
// - 와인_all.csv → Region/Producer/Grape/Wine/WineGrape
// - tasting-notes/*.md → TastingNote (+ 구매 가격은 PriceObservation 한 건으로)
// 여러 번 돌려도 같은 결과가 되도록 시작할 때 테이블을 비운다.
//
// 실행: pnpm db:seed  (스키마 반영은 pnpm db:push 로 먼저)

import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import {
  koreanKey,
  parseAbv,
  parseBlend,
  parseCsv,
  parseFrenchDate,
  parsePriceKRW,
  parseVintage,
  slugify,
  splitName,
} from "./lib/normalize";
import { countryCoord } from "./lib/region-coords";
import { originalNameFor } from "./lib/wine-name-overrides";

const SEED_DIR = path.join(process.cwd(), "data", "seed");
const CSV_PATH = path.join(SEED_DIR, "와인_all.csv");
const NOTES_DIR = path.join(SEED_DIR, "tasting-notes");

const COUNTRY_SLUG: Record<string, string> = {
  이탈리아: "italy",
  아르헨티나: "argentina",
  미국: "usa",
  독일: "germany",
  프랑스: "france",
  칠레: "chile",
  뉴질랜드: "new-zealand",
  남아프리카공화국: "south-africa",
  헝가리: "hungary",
  호주: "australia",
};

const TYPE_MAP: Record<string, string> = {
  레드: "red",
  화이트: "white",
  로제: "rose",
  스파클링: "sparkling",
  샴페인: "champagne",
};

const PLACEHOLDER_PRODUCERS = new Set(["아무 생산자", "", "-"]);

// 슬러그 충돌 방지: 이미 쓴 슬러그면 -2, -3 을 붙인다.
const usedSlugs = new Set<string>();
function uniqueSlug(base: string): string {
  const root = slugify(base);
  let slug = root;
  let n = 2;
  while (usedSlugs.has(slug)) {
    slug = `${root}-${n}`;
    n++;
  }
  usedSlugs.add(slug);
  return slug;
}

async function clearAll(): Promise<void> {
  // 자식 → 부모 순서로 비운다.
  await db.priceObservation.deleteMany();
  await db.tastingNote.deleteMany();
  await db.wineGrape.deleteMany();
  await db.vintage.deleteMany();
  await db.wine.deleteMany();
  await db.producer.deleteMany();
  await db.grape.deleteMany();
  await db.region.deleteMany();
}

async function main() {
  console.log("시드 시작 — 기존 데이터 비우는 중…");
  await clearAll();

  const countryCache = new Map<string, string>(); // countryKo → regionId
  const regionCache = new Map<string, string>(); // 위치 문자열 → regionId
  const producerCache = new Map<string, string>(); // 생산자 문자열 → producerId
  const grapeCache = new Map<string, string>(); // 품종 nameKo → grapeId

  async function ensureCountry(countryKo: string): Promise<string | null> {
    const key = countryKo.trim();
    if (!key) return null;
    const cached = countryCache.get(key);
    if (cached) return cached;
    const coord = countryCoord(key);
    const region = await db.region.create({
      data: {
        slug: uniqueSlug(COUNTRY_SLUG[key] ?? key),
        nameKo: key,
        country: key,
        level: "country",
        latitude: coord?.lat ?? null,
        longitude: coord?.lng ?? null,
      },
    });
    countryCache.set(key, region.id);
    return region.id;
  }

  async function ensureRegion(locationStr: string, countryKo: string): Promise<string | null> {
    const loc = locationStr.trim();
    const countryId = await ensureCountry(countryKo);
    if (!loc) return countryId; // 위치가 비면 국가 단위로 붙인다.
    const cached = regionCache.get(loc);
    if (cached) return cached;
    const { nameKo, nameLocal } = splitName(loc);
    const region = await db.region.create({
      data: {
        slug: uniqueSlug(nameLocal ?? nameKo),
        nameKo,
        nameLocal,
        country: countryKo || null,
        level: "region",
        parentId: countryId,
      },
    });
    regionCache.set(loc, region.id);
    return region.id;
  }

  async function ensureProducer(
    producerStr: string,
    regionId: string | null
  ): Promise<string | null> {
    const raw = producerStr.trim();
    if (PLACEHOLDER_PRODUCERS.has(raw)) return null;
    const cached = producerCache.get(raw);
    if (cached) return cached;
    const { nameKo, nameLocal } = splitName(raw);
    const producer = await db.producer.create({
      data: { slug: uniqueSlug(nameLocal ?? nameKo), nameKo, nameLocal, regionId },
    });
    producerCache.set(raw, producer.id);
    return producer.id;
  }

  async function ensureGrape(nameKo: string, nameLocal: string | null): Promise<string> {
    const cached = grapeCache.get(nameKo);
    if (cached) return cached;
    const grape = await db.grape.create({
      data: { slug: uniqueSlug(nameLocal ?? nameKo), nameKo, nameLocal },
    });
    grapeCache.set(nameKo, grape.id);
    return grape.id;
  }

  // ── 1) CSV → 와인 ──────────────────────────────────────────────
  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(csvText);
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const iNom = col("Nom");
  const iCountry = col("국가");
  const iAbv = col("도수");
  const iGrade = col("등급");
  const iNote = col("비고");
  const iProducer = col("생산자");
  const iLocation = col("위치");
  const iType = col("종류");
  const iGrape = col("품종");

  const wines: { id: string; nameKo: string; koKey: string }[] = [];

  for (const row of rows.slice(1)) {
    if (!row[iNom]?.trim()) continue;
    const split = splitName(row[iNom]);
    const nameKo = split.nameKo;
    // 원어 이름은 교정본을 우선 쓰고, 없으면 시드가 나눈 라틴 표기를 쓴다.
    const nameLocal = originalNameFor(nameKo) ?? split.nameLocal;
    const countryKo = (row[iCountry] ?? "").trim();
    const regionId = await ensureRegion(row[iLocation] ?? "", countryKo);
    const producerId = await ensureProducer(row[iProducer] ?? "", regionId);
    const typeKo = (row[iType] ?? "").trim();
    const blendRaw = (row[iGrape] ?? "").trim();

    const wine = await db.wine.create({
      data: {
        slug: uniqueSlug(nameLocal ?? nameKo),
        nameKo,
        nameLocal,
        producerId,
        regionId,
        type: TYPE_MAP[typeKo] ?? null,
        abv: parseAbv(row[iAbv] ?? ""),
        classification: (row[iGrade] ?? "").trim() || null,
        notesKo: (row[iNote] ?? "").trim() || null,
        blendRaw: blendRaw || null,
      },
    });
    wines.push({ id: wine.id, nameKo, koKey: koreanKey(nameKo) });

    for (const g of parseBlend(blendRaw)) {
      const grapeId = await ensureGrape(g.nameKo, g.nameLocal);
      await db.wineGrape.create({
        data: { wineId: wine.id, grapeId, percent: g.percent },
      });
    }
  }
  console.log(
    `와인 ${wines.length}건, 지역 ${countryCache.size + regionCache.size}건, ` +
      `생산자 ${producerCache.size}건, 품종 ${grapeCache.size}건 생성.`
  );

  // ── 2) 시음노트 → TastingNote (+ PriceObservation) ─────────────
  function findWine(noteName: string): { id: string; nameKo: string } | null {
    const key = koreanKey(noteName);
    const exact = wines.find((w) => w.koKey === key);
    if (exact) return exact;
    // 표기가 조금 다른 경우: 한글 키의 공통 앞부분이 가장 긴 와인을 고른다(4자 이상, 애매하지 않을 때).
    let best: { w: (typeof wines)[number]; len: number } | null = null;
    let secondLen = 0;
    for (const w of wines) {
      let len = 0;
      while (len < key.length && len < w.koKey.length && key[len] === w.koKey[len]) len++;
      if (!best || len > best.len) {
        secondLen = best?.len ?? 0;
        best = { w, len };
      } else if (len > secondLen) {
        secondLen = len;
      }
    }
    if (best && best.len >= 4 && best.len > secondLen) return best.w;
    return null;
  }

  const noteFiles = fs
    .readdirSync(NOTES_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(f))
    .sort();

  let matched = 0;
  let priceCount = 0;
  const unmatched: string[] = [];

  for (const file of noteFiles) {
    const text = fs.readFileSync(path.join(NOTES_DIR, file), "utf8");
    const fileDateStr = file.slice(0, 10); // YYYY-MM-DD
    const fileDate = new Date(`${fileDateStr}T00:00:00.000Z`);

    const field = (label: string): string | null => {
      const m = text.match(new RegExp(`^-\\s*${label}\\s*:\\s*(.+)$`, "m"));
      return m ? m[1].trim() : null;
    };

    const wineLine = (field("와인") ?? "").replace(/\s*\(\[상세\].*$/, "").trim();
    const wine = findWine(wineLine);
    if (!wine) {
      unmatched.push(`${file} → "${wineLine}"`);
      continue;
    }

    const purchasedOn = parseFrenchDate(field("구매일") ?? "");
    const drankOnRaw = parseFrenchDate(field("음용일") ?? "");
    const drankOn = drankOnRaw ?? fileDate; // 음용일이 없으면 파일명 날짜로.
    const vintageYear = parseVintage(field("빈티지") ?? "");
    const priceRaw = field("구매 가격");
    const purchasePrice = priceRaw ? parsePriceKRW(priceRaw) : null;

    const memoMatch = text.match(/##\s*시음\s*메모\s*\n([\s\S]*)$/);
    const bodyText = memoMatch ? memoMatch[1].trim() || null : null;

    await db.tastingNote.create({
      data: {
        wineId: wine.id,
        vintageYear,
        drankOn,
        purchasedOn,
        purchasePrice,
        bodyText,
        owner: "admin",
        isPublic: true,
      },
    });
    matched++;

    if (purchasePrice) {
      await db.priceObservation.create({
        data: {
          wineId: wine.id,
          vintageYear,
          price: purchasePrice,
          source: "purchase",
          observedOn: purchasedOn ?? drankOn,
        },
      });
      priceCount++;
    }
  }

  console.log(`시음노트 ${matched}건, 시세 관측 ${priceCount}건 생성.`);
  if (unmatched.length > 0) {
    console.warn(`매칭 실패 ${unmatched.length}건 (수동 확인 필요):`);
    for (const u of unmatched) console.warn(`  - ${u}`);
  }
  console.log("시드 완료.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
