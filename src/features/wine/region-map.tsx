"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

// 와인 산지로 부드럽게 날아가는 지도.
// maplibre는 window에 의존하므로 SSR을 피해 useEffect 안에서 동적 로드한다.
// 타일은 키가 필요 없는 OpenFreeMap 스타일을 쓴다.
export function RegionMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let map: MlMap | undefined;
    let cancelled = false;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !ref.current) return;

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const m = new maplibregl.Map({
        container: ref.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [lng, lat],
        zoom: reduce ? 5 : 1.6,
        attributionControl: { compact: true },
      });
      map = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      new maplibregl.Marker({ color: "#b83259" }).setLngLat([lng, lat]).addTo(m);

      m.on("load", () => {
        if (!reduce) {
          m.flyTo({ center: [lng, lat], zoom: 5.5, speed: 0.5, curve: 1.4, essential: true });
        }
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng]);

  return (
    <section
      ref={ref}
      aria-label={`${label} 산지 지도`}
      className="h-72 w-full overflow-hidden rounded-xl border border-rose/15"
    />
  );
}
