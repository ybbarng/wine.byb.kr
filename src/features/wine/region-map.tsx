"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { FilterSpecification, LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { englishCountry } from "./country-names";
import { countryGeo } from "./wine-geo";

// 지도가 뜨기 전(타일 로드 전) 컨테이너를 채울 색. maplibre 기본 흰 배경이 탄 톤
// 테마와 대비돼 "흰 플래시"처럼 보이던 걸 없앤다. 로드된 지도의 옅은 땅 색과도 가깝다.
const MAP_LOADING_BG = "#e7ded2";

// 산지 폴리곤(약 856KB)은 어느 나라든 같은 파일을 쓴다. 페이지를 옮길 때마다 다시
// 받고 파싱하면 지도가 늦게 떠 깜빡인다 → 모듈 수준에서 한 번만 받아 캐시한다.
// (undefined=아직 안 받음, null=받기 실패)
let regionShapesCache: FeatureCollection | null | undefined;
let regionShapesPending: Promise<FeatureCollection | null> | null = null;
async function loadRegionShapes(): Promise<FeatureCollection | null> {
  if (regionShapesCache !== undefined) return regionShapesCache;
  if (!regionShapesPending) {
    regionShapesPending = fetch("/geo/region-shapes.geojson")
      .then((r) => r.json() as Promise<FeatureCollection>)
      .then((data) => {
        regionShapesCache = data;
        return data;
      })
      .catch(() => {
        regionShapesCache = null;
        return null;
      });
  }
  return regionShapesPending;
}

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

// 산지를 "영역 색칠"로 보여주는 지도. 국가 영역을 옅게 칠하고, 그 위에 주요 산지를
// 원형 영역으로 겹친다(이 와인 산지=gold, 다른 산지=청록). 좁아질수록 짙어지는 계층.
// maplibre는 window에 의존하므로 SSR을 피해 useEffect 안에서 동적 로드한다.
export function RegionMap({ country, regionName, fallback, label, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let map: MlMap | undefined;
    let cancelled = false;
    let revealFallback: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !ref.current) return;

      const geo = countryGeo(country);
      const enName = englishCountry(country);

      // 이 나라의 산지 폴리곤(있으면 원형 대신 실제 경계로 채색). 없으면 null → 원형.
      let regionShapes: FeatureCollection | null = null;
      if (country) {
        const all = await loadRegionShapes();
        if (cancelled || !ref.current) return;
        if (all) {
          const mine = all.features.filter((f) => f.properties?.country === country);
          if (mine.length > 0) regionShapes = { type: "FeatureCollection", features: mine };
        }
      }

      // 처음부터 국가에 맞춰 열어 스케일이 어긋나지 않게 한다.
      const bounds: LngLatBoundsLike | undefined = geo
        ? (geo.bbox as LngLatBoundsLike)
        : fallback
          ? ([
              [fallback.lng - 6, fallback.lat - 6],
              [fallback.lng + 6, fallback.lat + 6],
            ] as LngLatBoundsLike)
          : undefined;

      const m = new maplibregl.Map({
        container: ref.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        bounds,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
      });
      map = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      // 준비되면 페이드인 — 타일이 다 그려질 때까지 지도를 숨긴다(그동안 컨테이너의
      // 테마색이 보인다). "흰 빈 박스 → 폴리곤만 뜬 상태 → 베이스 타일 팝인" 순서가
      // 그대로 노출돼 깜빡이던 걸 없앤다. idle(타일·소스 모두 정착)에서 켜되, 혹시
      // idle 이 안 오는 경우를 대비해 타임아웃으로도 켠다.
      const canvas = m.getCanvas();
      canvas.style.opacity = "0";
      canvas.style.transition = "opacity 450ms ease-out";
      let shown = false;
      const reveal = () => {
        if (shown || cancelled) return;
        shown = true;
        canvas.style.opacity = "1";
      };
      m.once("idle", reveal);
      revealFallback = setTimeout(reveal, 2500);

      // 스타일 JSON이 파싱되면 레이어를 얹는다("load"는 sprite/glyphs까지 기다리므로
      // 더 이른 "style.load"에서 추가한다. 글자 라벨은 glyphs 로드 후 자연히 나타난다).
      m.once("style.load", () => {
        // 1) 국가 영역 채색(전세계 경계에서 이 나라만 필터)
        if (enName) {
          m.addSource("countries", { type: "geojson", data: "/geo/countries.geojson" });
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
        // 계층 패널과 결을 맞춘다: 선택 지역=진한 와인색 + gold 테두리·라벨(패널의 와인색+gold),
        // 나머지=붉은색 아닌 색을 지역마다 다르게 하되 흐리게(선택 지역이 도드라지게).
        if (regionShapes) {
          const geoRegions = geo?.regions ?? [];
          const labels: {
            type: "Feature";
            properties: { region: string; color: string; mine: number };
            geometry: { type: "Point"; coordinates: [number, number] };
          }[] = [];
          regionShapes.features.forEach((f, idx) => {
            const key = String(f.properties?.region ?? "");
            const mine = key && regionName?.includes(key) ? 1 : 0;
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
          const matched = geo.regions.find((r) => regionName?.includes(r.name));
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
        // 카메라는 생성자 bounds(+fitBoundsOptions)로 이미 이 나라에 맞춰 열렸다.
        // 여기서 다시 fitBounds 로 애니메이션하면 살짝 재-팬이 생기므로 하지 않는다.
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(revealFallback);
      map?.remove();
    };
  }, [country, regionName, fallback]);

  return (
    <section
      ref={ref}
      aria-label={`${label} 산지 지도`}
      // 타일이 다 그려질 때까지 지도(canvas)는 투명하고, 그동안 이 배경색이 보인다
      // (흰 플래시 방지). 지도가 뜨면 그 위로 페이드인된다.
      style={{ background: MAP_LOADING_BG }}
      className={className ?? "h-80 w-full overflow-hidden rounded-xl border border-rose/15"}
    />
  );
}
