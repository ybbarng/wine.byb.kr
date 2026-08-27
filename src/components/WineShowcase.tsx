"use client";

import dynamic from "next/dynamic";
import { ShowcaseHeader } from "./ShowcaseHeader";

// 글라스 캔버스 배경(3D 씬) → ACES 톤매핑 후 화면엔 #bda588. 페이지 배경을 그
// 렌더색에 맞춰 캔버스 이음새를 없앤다.
const CANVAS_BG = "#9a8168";
const CANVAS_RENDERED = "#bda588";

// 홈 기본 글라스(메를로 색·보르도 잔). 검색은 상세 페이지로 이동한다.
const HOME_ABSORB: [number, number, number] = [16, 78, 98];
const HOME_GLASS = 1; // 보르도

const FluidLab = dynamic(() => import("./FluidLab"), {
  ssr: false,
  loading: () => null,
});

// 홈 랜딩: 상단 검색바(→ 검색 시 /wine/[slug] 로 이동) + 중앙에 빛나는 3D 와인잔.
export default function WineShowcase() {
  const year = new Date().getFullYear();
  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{ backgroundColor: CANVAS_RENDERED }}
    >
      <ShowcaseHeader />

      {/* 중앙 글라스 (배경과 이음새 없이 떠 있음). 캔버스를 잔보다 넓게 잡아
          기울여도 영역 밖으로 안 나가게 한다(잔은 높이에 맞춰지고 좌우는 여백). */}
      <div className="absolute left-1/2 top-[6vh] h-[76vh] w-[68vh] max-w-full -translate-x-1/2">
        <FluidLab
          wineAbsorb={HOME_ABSORB}
          glassType={HOME_GLASS}
          bgColor={CANVAS_BG}
          swirlScale={0.8}
        />
      </div>

      {/* 푸터 */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 px-6 py-3 text-[11px] text-muted">
        <span>© {year} ybbarng</span>
        <span className="flex items-center gap-2">
          <a
            href="https://github.com/ybbarng/wine.byb.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <span className="text-foreground/20">·</span>
          <span>Claude Code 로 만든 와인 아카이브</span>
        </span>
      </footer>
    </div>
  );
}
