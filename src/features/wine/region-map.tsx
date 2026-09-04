"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { FilterSpecification, LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { englishCountry } from "./country-names";
import { countryGeo } from "./wine-geo";

// 지도가 처음 뜨기 전(타일 로드 전) 컨테이너를 채울 색. maplibre 기본 흰 배경이 탄 톤
// 테마와 대비돼 "흰 플래시"처럼 보이던 걸 없앤다. 로드된 지도의 옅은 땅 색과도 가깝다.
const MAP_LOADING_BG = "#e7ded2";

// 큰 GeoJSON(산지 폴리곤 약 856KB·세계 국경)은 어느 나라든 같은 파일을 쓴다. 페이지를
// 옮길 때마다 다시 받고 파싱하면 지도가 늦게 떠 깜빡인다 → 모듈 수준에서 한 번만 받아
// 캐시하고, 소스에 URL 대신 이 캐시 데이터를 넣어 재-추가 시 재요청이 없게 한다.
function makeGeoCache(url: string) {
  let cache: FeatureCollection | null | undefined; // undefined=미수신, null=실패
  let pending: Promise<FeatureCollection | null> | null = null;
  return async function load(): Promise<FeatureCollection | null> {
    if (cache !== undefined) return cache;
    if (!pending) {
      pending = fetch(url)
        .then((r) => r.json() as Promise<FeatureCollection>)
        .then((data) => {
          cache = data;
          return data;
        })
        .catch(() => {
          cache = null;
          return null;
        });
    }
    return pending;
  };
}
const loadRegionShapes = makeGeoCache("/geo/region-shapes.geojson");
const loadCountries = makeGeoCache("/geo/countries.geojson");

interface Props {
  country: string | null;
  /** 이 와인의 지역 이름(주요 산지 중 하나와 맞으면 강조색). */
  regionName?: string | null;
  /** 국가 지리 데이터가 없을 때 중심으로 삼을 좌표. */
  fallback: { lat: number; lng: number } | null;
  label: string;
  /** 컨테이너 스타일 override(기본은 h-80 카드). 부모를 꽉 채우려면 "h-full w-full". */
  className?: string;
}
type MapProps = Pick<Props, "country" | "regionName" | "fallback">;

// 색은 테마 토큰과 결을 맞춘다(globals.css: --wine/--wine-bright/--gold).
const COUNTRY_FILL = "#6e1a33"; // 국가 영역(가장 넓음·옅은 와인색 — 계층 최상위, --wine)
const SELECTED_FILL = "#9d2846"; // 선택 산지 채색(밝은 와인색 — 패널 지역 레벨과 결 맞춤, --wine-bright)
const GOLD = "#8a5616"; // 선택 강조 테두리·라벨(패널의 gold 액센트와 통일, --gold)
const THIS_REGION = "#8a5616"; // (원형 폴백에서 쓰는 이 와인 산지색, --gold)
const OTHER_REGION = "#5b9aa9"; // (원형 폴백에서 쓰는 기본 청록)
// 선택되지 않은 산지들 — 붉은색 아닌 색을 지역마다 다르게. 라벨 색도 이 색을 따른다.
// 밝은 지도 위에서 글자가 읽히도록 진한 계열로(채색은 낮은 불투명도라 옅게 깔린다).
const OTHER_PALETTE = [
  "#2f7d8c", // 청록
  "#3f8a55", // 초록
  "#3a5f9e", // 파랑
  "#5a6b86", // 청회색
  "#2f6f66", // 짙은 청록
  "#5a7a3a", // 올리브
  "#2f8a95", // 시안
  "#4a6f9e", // 남색
];

// 전환 때 지우고 다시 얹는 "데이터" 레이어·소스(베이스 지도 스타일은 건드리지 않는다).
// 순서 주의: 레이어를 먼저 지운 뒤 소스를 지운다(소스에 딸린 레이어가 있으면 못 지움).
const DATA_LAYERS = [
  "country-fill",
  "country-line",
  "region-fill",
  "region-line",
  "region-highlight",
  "region-shape-label",
  "region-area",
  "region-label",
];
const DATA_SOURCES = ["countries", "region-shapes", "region-labels", "regions"];

function computeBounds(p: MapProps): LngLatBoundsLike | undefined {
  const g = countryGeo(p.country);
  return g
    ? (g.bbox as LngLatBoundsLike)
    : p.fallback
      ? ([
          [p.fallback.lng - 6, p.fallback.lat - 6],
          [p.fallback.lng + 6, p.fallback.lat + 6],
        ] as LngLatBoundsLike)
      : undefined;
}

// ── 앱 전체가 공유하는 지도 하나(싱글턴) ──────────────────────────────────────
// RegionMap 은 페이지를 옮길 때마다 언마운트→마운트된다. 그때마다 새 지도를 만들면
// 그 사이 빈 박스가 번쩍인다. 그래서 지도 인스턴스와 컨테이너 div 를 모듈에 하나만
// 두고, RegionMap 이 마운트될 때 그 div 를 현재 자리로 옮겨 붙인다(reparent). 지도와
// "마지막으로 그려진 화면"이 그대로 살아 있어, 전환 때 이전 지도가 보이다가 데이터·
// 카메라만 갱신돼 빈 박스가 생기지 않는다(한 화면에 지도는 하나뿐이라 공유가 안전).
let sharedMap: MlMap | null = null;
let sharedContainer: HTMLDivElement | null = null;
let sharedStyleReady = false; // style.load 완료
let sharedShown = false; // 최초 페이드인 완료
let ensurePending: Promise<{ map: MlMap; container: HTMLDivElement }> | null = null;
let applyVer = 0; // 빠른 연속 전환에서 뒤처진 갱신을 버리는 토큰
let firstApplyDone = false; // 첫 갱신은 카메라를 즉시(팬 없이) 맞춘다

// parent 자리로 지도 컨테이너를 붙이고(없으면 생성) 지도 인스턴스를 돌려준다.
// 지도는 "크기가 있는" 컨테이너 위에서 만들어야 타일이 제때 로드된다 → 컨테이너를 먼저
// parent 에 붙인 뒤 생성한다.
async function ensureMap(parent: HTMLElement, initialBounds: LngLatBoundsLike | undefined) {
  if (sharedMap && sharedContainer) {
    if (sharedContainer.parentNode !== parent) parent.appendChild(sharedContainer);
    sharedMap.resize();
    return { map: sharedMap, container: sharedContainer };
  }
  if (ensurePending) return ensurePending;
  ensurePending = (async () => {
    const maplibregl = await import("maplibre-gl");
    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = "100%";
    parent.appendChild(container); // 크기를 확보한 뒤 지도 생성
    const map = new maplibregl.Map({
      container,
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds: initialBounds,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.once("style.load", () => {
      sharedStyleReady = true;
    });
    // 최초 1회 페이드인 — 첫 화면이 그려질 때까지 숨긴다(컨테이너 테마색이 보임).
    // 리스너는 여기서 "지도 생성 즉시" 붙인다. 마운트 이펙트에서 await 뒤에 붙이면
    // 그 사이 load/idle 이 먼저 발생해 놓쳐, 2.5초 안전망까지 기다리게 된다.
    const canvas = map.getCanvas();
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 450ms ease-out";
    const reveal = () => {
      if (sharedShown) return;
      sharedShown = true;
      canvas.style.opacity = "1";
    };
    map.once("load", reveal); // 초기 화면 준비됨(가장 이른 신호)
    map.once("idle", reveal); // 타일까지 정착
    setTimeout(reveal, 2500); // 안전망
    sharedMap = map;
    sharedContainer = container;
    return { map, container };
  })();
  return ensurePending;
}

// 현재 props 로 데이터 레이어를 다시 얹고 카메라를 옮긴다(베이스 지도는 유지).
async function applyRegionData(m: MlMap, p: MapProps) {
  if (!m.isStyleLoaded()) return;
  const ver = ++applyVer;
  const geo = countryGeo(p.country);
  const enName = englishCountry(p.country);

  // 이 나라의 산지 폴리곤(있으면 원형 대신 실제 경계로 채색). 없으면 null → 원형.
  let regionShapes: FeatureCollection | null = null;
  if (p.country) {
    const all = await loadRegionShapes();
    if (ver !== applyVer) return; // 더 최신 전환이 왔으면 중단
    if (all) {
      const mine = all.features.filter((f) => f.properties?.country === p.country);
      if (mine.length > 0) regionShapes = { type: "FeatureCollection", features: mine };
    }
  }
  let countriesData: FeatureCollection | null = null;
  if (enName) {
    countriesData = await loadCountries();
    if (ver !== applyVer) return;
  }

  // 이전 데이터 레이어·소스만 제거(베이스 스타일 레이어는 그대로 둔다).
  for (const id of DATA_LAYERS) if (m.getLayer(id)) m.removeLayer(id);
  for (const id of DATA_SOURCES) if (m.getSource(id)) m.removeSource(id);

  // 1) 국가 영역 채색(전세계 경계에서 이 나라만 필터)
  if (enName && countriesData) {
    m.addSource("countries", { type: "geojson", data: countriesData });
    const only = ["==", ["get", "name"], enName] as FilterSpecification;
    m.addLayer({
      id: "country-fill",
      type: "fill",
      source: "countries",
      filter: only,
      paint: { "fill-color": COUNTRY_FILL, "fill-opacity": 0.22 },
    });
    m.addLayer({
      id: "country-line",
      type: "line",
      source: "countries",
      filter: only,
      paint: { "line-color": SELECTED_FILL, "line-width": 1, "line-opacity": 0.6 },
    });
  }

  // 2a) 산지 폴리곤이 있으면 실제 경계로 채색.
  if (regionShapes) {
    const geoRegions = geo?.regions ?? [];
    const labels: {
      type: "Feature";
      properties: { region: string; color: string; mine: number };
      geometry: { type: "Point"; coordinates: [number, number] };
    }[] = [];
    regionShapes.features.forEach((f, idx) => {
      const key = String(f.properties?.region ?? "");
      const mine = key && p.regionName?.includes(key) ? 1 : 0;
      const color = mine ? SELECTED_FILL : OTHER_PALETTE[idx % OTHER_PALETTE.length];
      if (f.properties) {
        f.properties.color = color;
        f.properties.mine = mine;
      }
      const coord = geoRegions.find((r) => r.name === key);
      if (coord) {
        labels.push({
          type: "Feature",
          properties: { region: key, color, mine },
          geometry: { type: "Point", coordinates: [coord.lng, coord.lat] },
        });
      }
    });
    const isMine = ["==", ["get", "mine"], 1] as FilterSpecification;
    const isOther = ["==", ["get", "mine"], 0] as FilterSpecification;

    m.addSource("region-shapes", { type: "geojson", data: regionShapes });
    m.addLayer({
      id: "region-fill",
      type: "fill",
      source: "region-shapes",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["case", ["==", ["get", "mine"], 1], 0.5, 0.12],
      },
    });
    // 선택 안 된 지역: 얇고 흐린 테두리
    m.addLayer({
      id: "region-line",
      type: "line",
      source: "region-shapes",
      filter: isOther,
      paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": 0.3 },
    });
    // 선택 지역: gold 테두리로 강조
    m.addLayer({
      id: "region-highlight",
      type: "line",
      source: "region-shapes",
      filter: isMine,
      paint: { "line-color": GOLD, "line-width": 3, "line-opacity": 0.95, "line-blur": 0.3 },
    });
    // 라벨은 지역당 한 곳(대표 좌표)에만. 선택=gold·크게·흰 테두리, 나머지=지역색·흐리게.
    m.addSource("region-labels", {
      type: "geojson",
      data: { type: "FeatureCollection", features: labels },
    });
    m.addLayer({
      id: "region-shape-label",
      type: "symbol",
      source: "region-labels",
      layout: {
        "text-field": ["get", "region"],
        "text-size": ["case", ["==", ["get", "mine"], 1], 17, 12],
      },
      paint: {
        "text-color": ["case", ["==", ["get", "mine"], 1], GOLD, ["get", "color"]],
        "text-opacity": ["case", ["==", ["get", "mine"], 1], 1, 0.65],
        "text-halo-color": "#ffffff",
        "text-halo-width": ["case", ["==", ["get", "mine"], 1], 2.4, 1],
      },
    });
  }
  // 2b) 폴리곤이 없으면 주요 산지를 원형 영역으로.
  else if (geo) {
    const matched = geo.regions.find((r) => p.regionName?.includes(r.name));
    const fc = {
      type: "FeatureCollection" as const,
      features: geo.regions.map((r) => ({
        type: "Feature" as const,
        properties: {
          name: r.name,
          kind: matched && r.name === matched.name ? "this" : "other",
        },
        geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
      })),
    };
    m.addSource("regions", { type: "geojson", data: fc });
    m.addLayer({
      id: "region-area",
      type: "circle",
      source: "regions",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 8, 6, 26],
        "circle-color": ["match", ["get", "kind"], "this", THIS_REGION, OTHER_REGION],
        "circle-opacity": 0.5,
        "circle-stroke-color": ["match", ["get", "kind"], "this", THIS_REGION, OTHER_REGION],
        "circle-stroke-width": 1.5,
      },
    });
    m.addLayer({
      id: "region-label",
      type: "symbol",
      source: "regions",
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-offset": [0, 1.6],
        "text-anchor": "top",
      },
      paint: {
        "text-color": ["match", ["get", "kind"], "this", THIS_REGION, "#2f5560"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.6,
      },
    });
  }

  // 카메라: 첫 갱신은 즉시 맞추고(팬 없음), 이후 전환은 새 나라로 부드럽게 팬한다.
  // 베이스 타일은 계속 보이므로 팬 중에도 빈 박스가 없다.
  const bounds = computeBounds(p);
  if (bounds) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    m.fitBounds(bounds, { padding: 24, duration: firstApplyDone && !reduce ? 700 : 0 });
  }
  firstApplyDone = true;
}

// 산지를 "영역 색칠"로 보여주는 지도. 국가 영역을 옅게 칠하고, 그 위에 주요 산지를
// 색으로 겹친다(이 와인 산지=gold, 다른 산지=청록). 좁아질수록 짙어지는 계층.
export function RegionMap({ country, regionName, fallback, label, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // 최신 props 를 참조로 들고, 지도가 준비된 뒤·전환 때 이 값으로 그린다.
  const propsRef = useRef<MapProps>({ country, regionName, fallback });
  propsRef.current = { country, regionName, fallback };

  // 마운트: 공유 지도의 컨테이너를 이 자리로 옮겨 붙이고, 현재 나라로 데이터·카메라 갱신.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    (async () => {
      // ensureMap 이 컨테이너를 이 자리로 붙인다(이전 부모에서 자동으로 빠짐). 공유 지도가
      // 이미 있으면 "마지막으로 그려진 화면"이 그대로 보인 채 붙으므로 빈 박스가 없다.
      const { map } = await ensureMap(el, computeBounds(propsRef.current));
      if (cancelled) return;

      const runApply = () => {
        if (!cancelled) void applyRegionData(map, propsRef.current);
      };
      if (sharedStyleReady) runApply();
      else map.once("style.load", runApply);
    })();

    return () => {
      cancelled = true;
      // 컨테이너만 이 자리에서 떼어 낸다(지도 인스턴스는 살려 둔다 → 다음 페이지에서 재사용).
      if (sharedContainer && sharedContainer.parentNode === el) {
        el.removeChild(sharedContainer);
      }
    };
  }, []);

  // 페이지 전환(같은 자리에서 props만 바뀔 때) → 데이터·카메라만 갱신.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 갱신은 propsRef 로 최신값을 읽는다
  useEffect(() => {
    if (sharedMap) void applyRegionData(sharedMap, propsRef.current);
  }, [country, regionName, fallback]);

  return (
    <section
      ref={ref}
      aria-label={`${label} 산지 지도`}
      // 지도가 처음 붙기 전엔 이 배경색이 보인다(흰 플래시 방지). 이후엔 공유 지도가
      // 이 자리로 옮겨와 채운다.
      style={{ background: MAP_LOADING_BG }}
      className={className ?? "h-80 w-full overflow-hidden rounded-xl border border-rose/15"}
    />
  );
}
