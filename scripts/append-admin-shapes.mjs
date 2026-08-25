// 행정구역(admin-1)이 곧 와인 지역인 나라의 실제 경계를 region-shapes.geojson에 덧붙인다.
// 프랑스는 이미 들어 있고(INAO 바생), 여기서는 행정구역과 와인 지역이 일치하는 나라만 추가한다.
//
// 원본은 공개 GeoJSON을 내려받아 쓴다(저장소에 원본은 담지 않음). 재현:
//   curl -sL <URL> -o /tmp/<file>.geojson
// 그다음 node scripts/append-admin-shapes.mjs 를 실행하면 public/geo/region-shapes.geojson에
// 해당 나라 피처를 (idempotent하게) 다시 써 넣는다.
//
// 좌표는 3자리로 반올림하고 반올림 후 겹치는 연속 점을 제거해 용량을 줄인다(지역 개관용).

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const SHAPES = "public/geo/region-shapes.geojson";

// 나라별: 원본 파일 경로 · 원본 지역명 프로퍼티 · {원본명 → 한국어 키} 매핑.
const SOURCES = [
  {
    country: "이탈리아",
    // https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson
    file: "/tmp/it-regions.geojson",
    prop: "reg_name",
    map: {
      Piemonte: "피에몬테",
      Veneto: "베네토",
      Toscana: "토스카나",
      Puglia: "뿔리아",
      Sicilia: "시칠리아",
    },
  },
  {
    country: "아르헨티나",
    // geoBoundaries gbOpen ARG ADM1 (provinces)
    file: "/tmp/arg-adm1.geojson",
    prop: "shapeName",
    map: {
      Mendoza: "멘도사",
      Salta: "살타",
    },
  },
  {
    country: "뉴질랜드",
    // geoBoundaries gbOpen NZL ADM1 (regions) — 말보로·혹스 베이만.
    // 말보로 사운즈 해안선이 매우 촘촘해 2자리(~1km)로 낮춰 용량을 줄인다(개관용).
    file: "/tmp/nzl-adm1.geojson",
    prop: "shapeName",
    precision: 2,
    map: {
      "Marlborough Region": "말보로",
      "Hawke's Bay Region": "혹스 베이",
    },
  },
];

// 산지 = 파일 하나(단일 지역) 형식. 미국 AVA(UCDavis)처럼 지역별 파일을 쓴다.
// 한 파일에 경계 개정 이력이 여러 feature로 들어 있으면 마지막(최신) 것을 쓴다.
// 미국은 폴리곤을 하나라도 넣으면 지도가 폴리곤 모드로 바뀌므로 wine-geo의 5개 산지를
// 모두 채워야 빠지는 곳이 없다.
// 원본: https://raw.githubusercontent.com/UCDavisLibrary/ava/HEAD/avas/<name>.geojson (CC0)
const SINGLE_SOURCES = [
  { country: "미국", region: "나파 밸리", file: "/tmp/us-napa_valley.geojson" },
  { country: "미국", region: "소노마", file: "/tmp/us-sonoma_valley.geojson" },
  { country: "미국", region: "몬테레이", file: "/tmp/us-monterey.geojson" },
  { country: "미국", region: "파소 로블스", file: "/tmp/us-paso_robles.geojson" },
  {
    country: "미국",
    region: "윌래밋 밸리",
    file: "/tmp/us-willamette_valley.geojson",
    precision: 2,
  },
];

const rounder = (decimals) => {
  const f = 10 ** decimals;
  return (n) => Math.round(n * f) / f;
};

// 링(점 배열)을 반올림하고 연속 중복점을 제거한다. 점이 4개 미만이면 버린다.
function reduceRing(ring, r) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [r(x), r(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out.length >= 4 ? out : null;
}

function reduceGeometry(geom, r) {
  if (geom.type === "Polygon") {
    const rings = geom.coordinates.map((ring) => reduceRing(ring, r)).filter(Boolean);
    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geom.type === "MultiPolygon") {
    const polys = geom.coordinates
      .map((poly) => poly.map((ring) => reduceRing(ring, r)).filter(Boolean))
      .filter((poly) => poly.length > 0);
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  return null;
}

const shapes = JSON.parse(readFileSync(SHAPES, "utf8"));

// 원본 파일이 있는 소스만 처리한다. 파일이 없는 나라는 손대지 않고 기존 피처를 보존한다
// (원하는 나라만 재다운로드해서 재빌드 가능). 처리하는 나라만 지우고 새로 넣는다(idempotent).
const activeMulti = SOURCES.filter((s) => existsSync(s.file));
const activeSingle = SINGLE_SOURCES.filter((s) => existsSync(s.file));
const rebuildCountries = new Set([
  ...activeMulti.map((s) => s.country),
  ...activeSingle.map((s) => s.country),
]);
shapes.features = shapes.features.filter((f) => !rebuildCountries.has(f.properties?.country));

let added = 0;
// 단일 지역 파일(미국 AVA 등): 파일의 마지막 feature를 현재 경계로 쓴다.
for (const src of activeSingle) {
  const fc = JSON.parse(readFileSync(src.file, "utf8"));
  const feat = fc.features[fc.features.length - 1];
  const geometry = feat && reduceGeometry(feat.geometry, rounder(src.precision ?? 3));
  if (!geometry) {
    console.warn(`  ! ${src.country}/${src.region}: 지오메트리 비었음`);
    continue;
  }
  shapes.features.push({
    type: "Feature",
    properties: { country: src.country, region: src.region, source: "wine" },
    geometry,
  });
  added += 1;
  console.log(`  + ${src.country} / ${src.region}`);
}

for (const src of activeMulti) {
  const fc = JSON.parse(readFileSync(src.file, "utf8"));
  const round = rounder(src.precision ?? 3);
  for (const [srcName, koName] of Object.entries(src.map)) {
    const feat = fc.features.find((f) => f.properties?.[src.prop] === srcName);
    if (!feat) {
      console.warn(`  ! ${src.country}: 원본에서 "${srcName}" 못 찾음`);
      continue;
    }
    const geometry = reduceGeometry(feat.geometry, round);
    if (!geometry) {
      console.warn(`  ! ${src.country}/${koName}: 지오메트리 비었음`);
      continue;
    }
    shapes.features.push({
      type: "Feature",
      properties: { country: src.country, region: koName, source: "admin" },
      geometry,
    });
    added += 1;
    console.log(`  + ${src.country} / ${koName}`);
  }
}

if (rebuildCountries.size === 0) {
  console.warn("처리할 소스 파일이 없다. 원본을 /tmp에 내려받고 다시 실행하라(주석 참조).");
}

writeFileSync(SHAPES, JSON.stringify(shapes));
console.log(`총 ${added}개 지역 추가. 전체 피처 ${shapes.features.length}개.`);
