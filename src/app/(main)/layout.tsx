"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ShowcaseHeader } from "@/components/ShowcaseHeader";
import { GlassProvider, useGlassOptional } from "@/features/glass/glass-context";

// 글라스 캔버스 배경(3D 씬) → ACES 톤매핑 후 화면엔 #bda588. 페이지 배경을 렌더색에
// 맞춰 캔버스 이음새를 없앤다(홈·상세 공통).
const CANVAS_BG = "#9a8168";
const CANVAS_RENDERED = "#bda588";

const FluidLab = dynamic(() => import("@/components/FluidLab"), {
  ssr: false,
  loading: () => null,
});

// 홈·상세가 공유하는 단 하나의 와인잔. 페이지 이동에도 재마운트되지 않고, 위치·크기만
// CSS 로 전환해 "홈 중앙 → 상세 왼쪽"으로 자연스럽게 이동한다.
function PersistentGlass() {
  const ctx = useGlassOptional();
  const pathname = usePathname();
  const isHome = pathname === "/";
  if (!ctx) return null;
  const { absorb, glass, swirlScale } = ctx.state;
  // 홈: 화면 중앙 크게. 상세: 데스크톱은 왼쪽 칸(19%), 모바일은 상단 고정 높이.
  const pos = isHome
    ? "left-1/2 top-[6vh] h-[76vh] w-[68vh] max-w-full -translate-x-1/2"
    : "left-4 right-4 top-20 h-72 md:left-6 md:right-auto md:top-16 md:bottom-6 md:h-auto md:w-[19%] md:min-w-[180px]";
  return (
    <div
      className={`pointer-events-none absolute z-10 transition-all duration-700 ease-in-out ${pos}`}
    >
      <div className="pointer-events-auto h-full w-full">
        <FluidLab
          wineAbsorb={absorb}
          glassType={glass}
          bgColor={CANVAS_BG}
          swirlScale={swirlScale}
        />
      </div>
    </div>
  );
}

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <GlassProvider>
      <div
        className="relative min-h-screen w-full md:h-screen md:overflow-hidden"
        style={{ backgroundColor: CANVAS_RENDERED }}
      >
        <ShowcaseHeader />
        <PersistentGlass />
        {children}
      </div>
    </GlassProvider>
  );
}
