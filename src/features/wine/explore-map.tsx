"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExploreCountry } from "@/app/explore/page";
import { BrandLogo } from "@/components/BrandLogo";
import { countryFlag } from "./country-names";

// 나라별 구분색(밝은 지도 위에서 또렷한 중간 톤). 폴리곤·핀·라벨에 함께 쓴다.
const COUNTRY_COLOR: Record<string, string> = {
  프랑스: "#9d2846",
  이탈리아: "#2f7d8c",
  미국: "#3f8a55",
  칠레: "#b8672f",
  아르헨티나: "#3a5f9e",
  뉴질랜드: "#2f6f66",
  독일: "#7a5aa0",
  헝가리: "#a0863a",
  남아프리카공화국: "#5a7a3a",
  호주: "#a04a5a",
};
const FALLBACK_COLOR = "#5a6b86";

// 전세계 산지 탐험 지도. 국가별로 색이 다른 산지 폴리곤/핀을 얹고, 클릭하면 상세로 간다.
// 상단에 국기 칩을 두어 나라로 날아갈 수 있다.
export function ExploreMap({ countries }: { countries: ExploreCountry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [tastedOnly, setTastedOnly] = useState(false);
  const tastedOnlyRef = useRef(tastedOnly);
  tastedOnlyRef.current = tastedOnly;
  const [grape, setGrape] = useState<string | null>(null);
  const grapeRef = useRef(grape);
  grapeRef.current = grape;

  // 필터에 쓸 품종 목록(모든 산지 주력 품종의 합집합).
  const grapeOptions = [
    ...new Set(countries.flatMap((c) => c.regions).flatMap((r) => r.keyGrapes)),
  ].sort();

  // "마신 곳만"·품종 필터를 적용한다. 조건을 통과한 산지 이름만 남긴다(핀·라벨·폴리곤 공통).
  const applyFilters = useCallback(
    (m: MlMap | null, tasted: boolean, g: string | null) => {
      if (!m?.getLayer("explore-pins")) return;
      const active = tasted || g != null;
      const layers = ["explore-pins", "explore-labels", "explore-fill", "explore-line"];
      if (!active) {
        for (const l of layers) m.setFilter(l, null);
        return;
      }
      const allowed = countries
        .flatMap((c) => c.regions)
        .filter((r) => (!tasted || r.wines > 0) && (!g || r.keyGrapes.includes(g)))
        .map((r) => r.name);
      const pinF = ["in", ["get", "name"], ["literal", allowed]] as never;
      const polyF = ["in", ["get", "region"], ["literal", allowed]] as never;
      m.setFilter("explore-pins", pinF);
      m.setFilter("explore-labels", pinF);
      m.setFilter("explore-fill", polyF);
      m.setFilter("explore-line", polyF);
    },
    [countries]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let map: MlMap | undefined;
    let cancelled = false;

    // 산지 이름(국가|이름) → slug. 폴리곤·핀 클릭 시 이동에 쓴다.
    const slugByKey = new Map<string, string>();
    const pins: FeatureCollection = {
      type: "FeatureCollection",
      features: countries.flatMap((c) =>
        c.regions.map((r) => {
          if (r.slug) slugByKey.set(`${c.country}|${r.name}`, r.slug);
          return {
            type: "Feature" as const,
            properties: {
              name: r.name,
              slug: r.slug ?? "",
              wines: r.wines,
              color: COUNTRY_COLOR[c.country] ?? FALLBACK_COLOR,
            },
            geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
          };
        })
      ),
    };
    // 국가별 색 match 식(폴리곤 fill/line).
    const colorMatch: (string | string[])[] = ["match", ["get", "country"]];
    for (const [country, color] of Object.entries(COUNTRY_COLOR)) colorMatch.push(country, color);
    colorMatch.push(FALLBACK_COLOR);

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !ref.current) return;

      const m = new maplibregl.Map({
        container: ref.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [10, 25],
        zoom: 1.4,
        attributionControl: { compact: true },
      });
      map = m;
      mapRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      m.once("style.load", () => {
        m.resize(); // 컨테이너 크기를 다시 읽어 캔버스를 꽉 채운다.
        m.addSource("region-shapes", { type: "geojson", data: "/geo/region-shapes.geojson" });
        m.addLayer({
          id: "explore-fill",
          type: "fill",
          source: "region-shapes",
          paint: { "fill-color": colorMatch as never, "fill-opacity": 0.35 },
        });
        m.addLayer({
          id: "explore-line",
          type: "line",
          source: "region-shapes",
          paint: { "line-color": colorMatch as never, "line-width": 1, "line-opacity": 0.6 },
        });

        m.addSource("region-pins", { type: "geojson", data: pins });
        m.addLayer({
          id: "explore-pins",
          type: "circle",
          source: "region-pins",
          paint: {
            // 마셔본 산지(wines>0)는 조금 더 크고 진하게, 아직 안 마신 곳은 작고 옅게.
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              2,
              ["case", [">", ["get", "wines"], 0], 5, 3.5],
              6,
              ["case", [">", ["get", "wines"], 0], 11, 7],
            ],
            "circle-color": ["get", "color"],
            "circle-opacity": ["case", [">", ["get", "wines"], 0], 0.9, 0.45],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.2,
          },
        });
        m.addLayer({
          id: "explore-labels",
          type: "symbol",
          source: "region-pins",
          layout: {
            "text-field": ["get", "name"],
            "text-size": 12,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
          },
          paint: {
            "text-color": ["get", "color"],
            "text-opacity": 0.9,
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.6,
          },
        });

        // 클릭 → 상세로. 폴리곤은 국가|지역으로 slug를 찾고, 핀은 자기 slug를 쓴다.
        const goPoly = (e: maplibregl.MapLayerMouseEvent) => {
          const p = e.features?.[0]?.properties as
            | { country?: string; region?: string }
            | undefined;
          const slug = p ? slugByKey.get(`${p.country}|${p.region}`) : undefined;
          if (slug) routerRef.current.push(`/region/${slug}`);
        };
        const goPin = (e: maplibregl.MapLayerMouseEvent) => {
          const slug = (e.features?.[0]?.properties as { slug?: string } | undefined)?.slug;
          if (slug) routerRef.current.push(`/region/${slug}`);
        };
        for (const [layer, handler] of [
          ["explore-fill", goPoly],
          ["explore-pins", goPin],
        ] as const) {
          m.on("click", layer, handler);
          m.on("mouseenter", layer, () => {
            m.getCanvas().style.cursor = "pointer";
          });
          m.on("mouseleave", layer, () => {
            m.getCanvas().style.cursor = "";
          });
        }

        applyFilters(m, tastedOnlyRef.current, grapeRef.current);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
  }, [countries, applyFilters]);

  // 필터가 바뀌면 이미 떠 있는 지도에 다시 적용한다.
  useEffect(() => {
    applyFilters(mapRef.current, tastedOnly, grape);
  }, [tastedOnly, grape, applyFilters]);

  const flyTo = (bbox: [number, number, number, number]) => {
    mapRef.current?.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ] as LngLatBoundsLike,
      { padding: 40, duration: 1200 }
    );
  };

  return (
    <section
      aria-label="전세계 산지 탐험 지도"
      className="relative h-screen w-full overflow-hidden bg-background"
    >
      <div ref={ref} className="h-screen w-full" />

      {/* 상단: 로고(홈) + 나라 칩 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4">
        <div className="pointer-events-auto flex w-fit flex-wrap items-center gap-2 rounded-3xl border border-foreground/12 bg-card/85 px-3 py-2 shadow-lg shadow-foreground/10 backdrop-blur sm:gap-3 sm:rounded-full sm:px-4">
          <BrandLogo />
          <span className="hidden text-sm text-muted sm:inline">산지 탐험</span>
          <button
            type="button"
            onClick={() => setTastedOnly((v) => !v)}
            aria-pressed={tastedOnly}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              tastedOnly
                ? "border-wine bg-wine text-on-accent"
                : "border-foreground/15 text-foreground/75 hover:border-foreground/30"
            }`}
          >
            마신 곳만
          </button>
          <select
            value={grape ?? ""}
            onChange={(e) => setGrape(e.target.value || null)}
            aria-label="품종으로 거르기"
            className={`rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none ${
              grape
                ? "border-wine bg-wine/10 text-foreground"
                : "border-foreground/15 text-foreground/75 hover:border-foreground/30"
            }`}
          >
            <option value="">모든 품종</option>
            {grapeOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {countries.map((c) => (
            <button
              key={c.country}
              type="button"
              onClick={() => flyTo(c.bbox)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-foreground/12 bg-card/85 px-3 py-1.5 text-xs text-foreground/85 shadow-sm backdrop-blur transition-colors hover:border-foreground/30 hover:bg-card"
            >
              {countryFlag(c.country) ? <span aria-hidden>{countryFlag(c.country)}</span> : null}
              {c.country}
              {c.wines > 0 ? <span className="text-muted">{c.wines}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
