"use client";

import dynamic from "next/dynamic";

// 3D 캔버스는 브라우저 전용 — SSR 없이 클라이언트에서만 마운트한다.
const WineGlass = dynamic(() => import("./WineGlass"), {
  ssr: false,
  loading: () => null,
});

export default function WineGlassMount() {
  return <WineGlass />;
}
