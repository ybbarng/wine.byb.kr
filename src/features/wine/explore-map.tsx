"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
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
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 6, 9],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.9,
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
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
  }, [countries]);

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
        <div className="pointer-events-auto flex w-fit items-center gap-3 rounded-full border border-foreground/12 bg-card/85 px-4 py-2 shadow-lg shadow-foreground/10 backdrop-blur">
          <BrandLogo />
          <span className="text-sm text-muted">산지 탐험</span>
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          {countries.map((c) => (
            <button
              key={c.country}
              type="button"
              onClick={() => flyTo(c.bbox)}
              className="flex items-center gap-1.5 rounded-full border border-foreground/12 bg-card/85 px-3 py-1.5 text-xs text-foreground/85 shadow-sm backdrop-blur transition-colors hover:border-foreground/30 hover:bg-card"
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
