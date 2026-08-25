// 행정구역(admin-1)이 곧 와인 지역인 나라의 실제 경계를 region-shapes.geojson에 덧붙인다.
// 프랑스는 이미 들어 있고(INAO 바생), 여기서는 행정구역과 와인 지역이 일치하는 나라만 추가한다.
//
// 원본은 공개 GeoJSON을 내려받아 쓴다(저장소에 원본은 담지 않음). 재현:
//   curl -sL <URL> -o /tmp/<file>.geojson
// 그다음 node scripts/append-admin-shapes.mjs 를 실행하면 public/geo/region-shapes.geojson에
// 해당 나라 피처를 (idempotent하게) 다시 써 넣는다.
//
// 좌표는 3자리로 반올림하고 반올림 후 겹치는 연속 점을 제거해 용량을 줄인다(지역 개관용).

import { readFileSync, writeFileSync } from "node:fs";

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
const addedCountries = new Set(SOURCES.map((s) => s.country));
// 이 스크립트가 다루는 나라의 기존 피처는 지우고 새로 넣는다(idempotent).
shapes.features = shapes.features.filter((f) => !addedCountries.has(f.properties?.country));

let added = 0;
for (const src of SOURCES) {
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

writeFileSync(SHAPES, JSON.stringify(shapes));
console.log(`총 ${added}개 지역 추가. 전체 피처 ${shapes.features.length}개.`);
