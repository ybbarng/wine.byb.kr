"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { FilterSpecification, LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { englishCountry } from "./country-names";
import { countryGeo } from "./wine-geo";

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

const COUNTRY_FILL = "#7b1e3b"; // 국가 영역(가장 넓음·옅게)
const THIS_REGION = "#d9a441"; // 이 와인의 산지(gold, 붉은/따뜻한 계열은 여기만)
const OTHER_REGION = "#5b9aa9"; // (원형 폴백에서 쓰는 기본 청록)
// 선택되지 않은 산지들 — 붉은색 아닌 색을 지역마다 다르게. 라벨 색도 이 색을 따른다.
const OTHER_PALETTE = [
  "#5b9aa9", // 청록
  "#6e9e7a", // 초록
  "#6e86b0", // 파랑
  "#8a9aae", // 청회색
  "#5e8a80", // 짙은 청록
  "#7f9a6e", // 올리브
  "#6ea0a9", // 시안
  "#9a9ab0", // 라벤더 회색
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

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !ref.current) return;

      const geo = countryGeo(country);
      const enName = englishCountry(country);

      // 이 나라의 산지 폴리곤(있으면 원형 대신 실제 경계로 채색). 없으면 null → 원형.
      let regionShapes: FeatureCollection | null = null;
      if (country) {
        try {
          const all = (await fetch("/geo/region-shapes.geojson").then((r) =>
            r.json()
          )) as FeatureCollection;
          const mine = all.features.filter((f) => f.properties?.country === country);
          if (mine.length > 0) regionShapes = { type: "FeatureCollection", features: mine };
        } catch {
          regionShapes = null;
        }
        if (cancelled || !ref.current) return;
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
            paint: { "line-color": "#b83259", "line-width": 1, "line-opacity": 0.6 },
          });
        }

        // 2a) 산지 폴리곤이 있으면 실제 경계로 채색.
        // 선택된 와인 산지만 gold, 나머지는 붉은색 아닌 색을 지역마다 다르게(연하게).
        // 지역 색·라벨 색·테두리 색을 같게 해 구별을 쉽게 한다. 라벨은 지역당 하나.
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
            const color = mine ? THIS_REGION : OTHER_PALETTE[idx % OTHER_PALETTE.length];
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

          m.addSource("region-shapes", { type: "geojson", data: regionShapes });
          m.addLayer({
            id: "region-fill",
            type: "fill",
            source: "region-shapes",
            paint: {
              "fill-color": ["get", "color"],
              "fill-opacity": ["case", ["==", ["get", "mine"], 1], 0.5, 0.22],
            },
          });
          m.addLayer({
            id: "region-line",
            type: "line",
            source: "region-shapes",
            paint: {
              "line-color": ["get", "color"],
              "line-width": ["case", ["==", ["get", "mine"], 1], 1.8, 1],
              "line-opacity": ["case", ["==", ["get", "mine"], 1], 0.9, 0.45],
            },
          });
          // 라벨은 지역당 한 곳(대표 좌표)에만. 색은 지역 색과 같게.
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
              "text-size": ["case", ["==", ["get", "mine"], 1], 14, 11],
            },
            paint: {
              "text-color": ["get", "color"],
              "text-halo-color": "#1a0510",
              "text-halo-width": 1.6,
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
              "text-color": "#f4e9ec",
              "text-halo-color": "#1a0510",
              "text-halo-width": 1.4,
            },
          });
        }

        if (bounds && !reduce) {
          m.fitBounds(bounds, { padding: 24, duration: 1200 });
        }
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [country, regionName, fallback]);

  return (
    <section
      ref={ref}
      aria-label={`${label} 산지 지도`}
      className={className ?? "h-80 w-full overflow-hidden rounded-xl border border-rose/15"}
    />
  );
}
