"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useState } from "react";
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
  belowMap?: ReactNode; // 가운데 칸에서 지도 아래로 들어갈 내용(산지 계층 등)
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
  belowMap,
}: Props) {
  // 스월 기울기: 데스크톱은 좁은 왼쪽 칸이라 작게, 모바일은 세로 스택으로 풀폭이라 넓게.
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const swirlScale = isDesktop ? 0.5 : 0.8;

  const hasMap = country != null || fallback != null;
  const map = hasMap ? (
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
  );
  return (
    // 데스크톱: 한 화면 3칸(글라스·지도·상세). 모바일: 세로로 쌓고 페이지가 스크롤된다.
    <div
      className="relative min-h-screen w-full md:h-screen md:overflow-hidden"
      style={{ backgroundColor: CANVAS_RENDERED }}
    >
      <ShowcaseHeader hairline={false} />

      <div className="flex flex-col gap-4 px-4 pb-10 pt-20 md:absolute md:inset-x-0 md:bottom-0 md:top-16 md:flex-row md:px-6 md:pb-6 md:pt-0">
        {/* 글라스 — 모바일은 고정 높이, 데스크톱은 왼쪽 칸 */}
        <div className="relative h-72 w-full shrink-0 md:h-auto md:w-[19%] md:min-w-[180px]">
          <FluidLab
            wineAbsorb={absorb}
            glassType={glass}
            bgColor={CANVAS_BG}
            swirlScale={swirlScale}
          />
        </div>

        {/* 산지 지도 (+ 지도 아래 내용) */}
        <div className="flex w-full shrink-0 flex-col gap-4 md:w-[28%] md:min-w-[260px]">
          <div
            className={`relative h-64 overflow-hidden rounded-3xl border border-foreground/12 shadow-lg shadow-foreground/10 ${
              belowMap ? "md:h-[42%] md:shrink-0" : "md:h-full md:flex-1"
            }`}
          >
            {map}
          </div>
          {belowMap ? (
            <div className="rounded-3xl border border-foreground/12 bg-card/75 p-5 shadow-lg shadow-foreground/10 backdrop-blur md:min-h-0 md:flex-1 md:overflow-y-auto">
              {belowMap}
            </div>
          ) : null}
        </div>

        {/* 상세 (데스크톱에서 가장 넓게) */}
        <aside className="min-w-0 rounded-3xl border border-foreground/12 bg-card/75 p-5 shadow-lg shadow-foreground/10 backdrop-blur md:flex-1 md:overflow-y-auto md:p-6">
          {children}
        </aside>
      </div>
    </div>
  );
}
