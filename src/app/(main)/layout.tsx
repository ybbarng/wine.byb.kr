"use client";

import type { ReactNode } from "react";
import { ShowcaseHeader } from "@/components/ShowcaseHeader";
import { GlassProvider } from "@/features/glass/glass-context";
import { GlassStage } from "@/features/glass/glass-stage";

// 글라스 캔버스 렌더색과 맞춘 페이지 배경(캔버스 이음새 제거).
const CANVAS_RENDERED = "#bda588";

// 홈·상세가 공유하는 와인잔 무대(GlassStage)를 한 번만 얹는다. 잔 종류가 같으면
// 같은 인스턴스가 위치·색만 바꾸고, 다르면 두 라이브 잔이 교차 슬라이드한다.
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <GlassProvider>
      <div
        className="relative min-h-screen w-full md:h-screen md:overflow-hidden"
        style={{ backgroundColor: CANVAS_RENDERED }}
      >
        <ShowcaseHeader />
        <GlassStage />
        {children}
      </div>
    </GlassProvider>
  );
}
