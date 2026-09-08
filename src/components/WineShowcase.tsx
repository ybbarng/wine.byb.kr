"use client";

import { GlassSetter, HOME_GLASS } from "@/features/glass/glass-context";

// 홈 랜딩: 검색바·헤더·와인잔·배경은 (main) 레이아웃이 제공한다. 여기선 홈 잔 상태를
// 지정하고 푸터만 얹는다. 검색해서 /wine/[slug] 로 가면 같은 잔이 왼쪽으로 이동한다.
export default function WineShowcase() {
  const year = new Date().getFullYear();
  return (
    <>
      <GlassSetter
        absorb={HOME_GLASS.absorb}
        glass={HOME_GLASS.glass}
        swirlScale={HOME_GLASS.swirlScale}
        abv={HOME_GLASS.abv}
      />
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
    </>
  );
}
