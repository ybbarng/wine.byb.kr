"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { RegionMap } from "@/features/wine/region-map";
import { ShowcaseHeader } from "./ShowcaseHeader";

// 글라스 캔버스 배경(3D 씬) → ACES 톤매핑 후 화면엔 #bda588. 페이지 배경을 그
// 렌더색에 맞춰 캔버스 이음새를 없앤다(홈과 동일).
const CANVAS_BG = "#9a8168";
const CANVAS_RENDERED = "#bda588";

const FluidLab = dynamic(() => import("./FluidLab"), {
  ssr: false,
  loading: () => null,
});

type Props = {
  absorb: [number, number, number];
  glass: number;
  country: string | null;
  regionName: string | null;
  fallback: { lat: number; lng: number } | null;
  label: string;
  children: ReactNode; // 오른쪽 상세 패널 내용(서버에서 렌더해 전달)
};

// 와인 상세/검색 결과 공용 3칸 레이아웃: 왼쪽 글라스 · 가운데 산지 지도 · 오른쪽 상세.
// 홈 검색 화면과 같은 구성·톤. (홈은 검색→여기로 이동)
export function WineDetailView({
  absorb,
  glass,
  country,
  regionName,
  fallback,
  label,
  children,
}: Props) {
  const hasMap = country != null || fallback != null;
  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{ backgroundColor: CANVAS_RENDERED }}
    >
      <ShowcaseHeader />

      <div className="absolute inset-x-0 bottom-0 top-16 flex gap-4 px-6 pb-6">
        {/* 왼쪽: 글라스 (배경과 이음새 없이 떠 있음) */}
        <div className="relative w-[30%] min-w-[220px] shrink-0">
          <FluidLab wineAbsorb={absorb} glassType={glass} bgColor={CANVAS_BG} swirlScale={0.5} />
        </div>

        {/* 가운데: 산지 지도 */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-3xl border border-foreground/12 shadow-lg shadow-foreground/10">
          {hasMap ? (
            <RegionMap
              country={country}
              regionName={regionName}
              fallback={fallback}
              label={label}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              산지 정보 준비 중
            </div>
          )}
        </div>

        {/* 오른쪽: 상세 */}
        <aside className="w-[26rem] shrink-0 overflow-y-auto rounded-3xl border border-foreground/12 bg-card/75 p-6 shadow-lg shadow-foreground/10 backdrop-blur">
          {children}
        </aside>
      </div>
    </div>
  );
}
