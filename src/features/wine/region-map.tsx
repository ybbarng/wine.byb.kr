"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { countryGeo } from "./wine-geo";

interface Props {
  country: string | null;
  /** 이 와인의 지역 이름(주요 산지 핀 중 하나와 맞으면 강조). */
  regionName?: string | null;
  /** 국가 지리 데이터가 없을 때 날아갈 좌표. */
  fallback: { lat: number; lng: number } | null;
  label: string;
}

const OTHER_COLOR = "#9a7a83"; // 그 나라의 다른 산지
const ACCENT_COLOR = "#d9a441"; // 이 와인의 산지(gold)

// 와인 산지로 부드럽게 이동하는 지도. 국가 경계를 가득 채우고, 그 나라 주요 산지를 핀으로.
// maplibre는 window에 의존하므로 SSR을 피해 useEffect 안에서 동적 로드한다.
export function RegionMap({ country, regionName, fallback, label }: Props) {
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
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const center: [number, number] = geo
        ? [(geo.bbox[0] + geo.bbox[2]) / 2, (geo.bbox[1] + geo.bbox[3]) / 2]
        : fallback
          ? [fallback.lng, fallback.lat]
          : [0, 20];

      const m = new maplibregl.Map({
        container: ref.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center,
        zoom: reduce ? 4 : 1.4,
        attributionControl: { compact: true },
      });
      map = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const addPin = (lat: number, lng: number, name: string, accent: boolean) => {
        const popup = new maplibregl.Popup({ closeButton: false, offset: 22 }).setText(name);
        const marker = new maplibregl.Marker({ color: accent ? ACCENT_COLOR : OTHER_COLOR })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(m);
        return marker;
      };

      if (geo) {
        const matched = geo.regions.find((r) => regionName?.includes(r.name));
        for (const r of geo.regions) {
          const isThis = matched != null && r.name === matched.name;
          const marker = addPin(r.lat, r.lng, r.name, isThis);
          if (isThis) marker.togglePopup(); // 이 와인의 산지는 이름을 열어둔다
        }
        m.on("load", () => {
          m.fitBounds(geo.bbox as LngLatBoundsLike, {
            padding: 40,
            duration: reduce ? 0 : 2400,
          });
        });
      } else if (fallback) {
        addPin(fallback.lat, fallback.lng, label, true);
        m.on("load", () => {
          if (!reduce) {
            m.flyTo({ center, zoom: 5.5, speed: 0.5, curve: 1.4, essential: true });
          }
        });
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [country, regionName, fallback, label]);

  return (
    <section
      ref={ref}
      aria-label={`${label} 산지 지도`}
      className="h-80 w-full overflow-hidden rounded-xl border border-rose/15"
    />
  );
}
