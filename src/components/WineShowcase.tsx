"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { RegionMap } from "@/features/wine/region-map";
import { SHOWCASE_WINES, type ShowcaseWine } from "@/features/wine/showcase-wines";

// 글라스 캔버스는 하나만 유지하고 컨테이너를 transform 으로만 옮긴다(리사이즈 없이
// 중앙→좌측으로 미끄러짐 → 스월·색 이어짐). ssr 불가(WebGPU).
const FluidLab = dynamic(() => import("./FluidLab"), {
  ssr: false,
  loading: () => null,
});

// 글라스 캔버스에 넘길 배경색(3D 씬 배경, 화면에 보이는 배경). /lab 처럼 따뜻한
// 톤이라 글라스가 잘 보인다. ACES 톤매핑을 거쳐 화면엔 다르게 나오므로, 페이지
// 컨테이너 배경은 렌더 결과(CANVAS_RENDERED)에 맞춰 이음새를 없앤다.
const CANVAS_BG = "#9a8168";
const CANVAS_RENDERED = "#bda588"; // 위 색이 ACES 톤매핑 후 화면에 나오는 실제 색(측정)

export default function WineShowcase() {
  const [selected, setSelected] = useState<ShowcaseWine | null>(null);
  const [query, setQuery] = useState("");
  const searched = selected !== null;
  // 첫 화면 글라스 기본값(메를로). 검색하면 선택 와인으로 색·잔 전환.
  const wine = selected ?? SHOWCASE_WINES[1];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SHOWCASE_WINES.filter(
      (w) =>
        w.nameKo.toLowerCase().includes(q) ||
        w.nameLocal.toLowerCase().includes(q) ||
        w.regionName.toLowerCase().includes(q) ||
        w.grape.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [query]);

  const pick = (w: ShowcaseWine) => {
    setSelected(w);
    setQuery("");
  };

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{ backgroundColor: CANVAS_RENDERED }}
    >
      {/* ── 상단 고정 검색바 ── */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 px-6 py-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="shrink-0 font-serif text-lg tracking-tight text-foreground"
        >
          wine<span className="text-gold">.</span>byb.kr
        </button>
        <div className="relative w-full max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="와인 검색 — 이름 · 품종 · 산지"
            className="w-full rounded-full border border-foreground/15 bg-card/70 px-5 py-2.5 text-sm text-foreground shadow-sm backdrop-blur placeholder:text-muted focus:border-foreground/40 focus:outline-none"
          />
          {results.length > 0 && (
            <ul className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl border border-foreground/10 bg-card/95 p-1 shadow-lg shadow-foreground/10 backdrop-blur">
              {results.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => pick(w)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-foreground/8"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-foreground/20"
                      style={{ background: w.color }}
                    />
                    <span className="text-foreground">{w.nameKo}</span>
                    <span className="text-muted">· {w.regionName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* 우측 내비(기존 홈과 동일). 좁은 화면에선 숨김 — 모바일 메뉴는 이후. */}
        <nav className="hidden shrink-0 items-center gap-5 text-sm text-muted sm:flex">
          <a href="/explore" className="transition-colors hover:text-foreground">
            탐험
          </a>
          <a href="/cellar" className="transition-colors hover:text-foreground">
            기록
          </a>
          <a href="/learn" className="transition-colors hover:text-foreground">
            학습
          </a>
        </nav>
      </header>

      {/* ── 글라스(유지·이동) ── 중앙(랜딩) ↔ 좌측(검색 후). transform 만 바뀜.
          가장자리로 갈수록 페이지 배경색으로 페이드(비네트)해 캔버스 경계를 지운다
          — 따뜻한 백라이트(3D 배경)는 유지하면서 사이트 배경과 매끄럽게 이어짐. */}
      <div
        className="absolute left-0 top-0 z-20 h-[76vh] w-[44vh] transition-transform duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          transformOrigin: "top left",
          transform: searched
            ? "translate(1.5vw, 9vh) scale(0.86)"
            : "translate(calc(50vw - 22vh), 6vh) scale(1)",
        }}
      >
        <FluidLab
          wineAbsorb={wine.absorb}
          glassType={wine.glass}
          bgColor={CANVAS_BG}
          swirlScale={0.5}
        />
      </div>

      {/* ── 지도 + 상세(검색 후) ── 오른쪽에서 페이드인 ── */}
      <div
        className={`absolute inset-y-0 right-0 z-10 flex w-[66vw] items-stretch gap-4 py-20 pl-2 pr-6 transition-all duration-700 ${
          searched ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"
        }`}
      >
        {/* 중앙: 산지 지도 */}
        <div className="relative flex-1 overflow-hidden rounded-3xl border border-foreground/12 shadow-lg shadow-foreground/10">
          {searched && (
            <RegionMap
              key={wine.id}
              country={wine.country}
              regionName={wine.regionName}
              fallback={wine.fallback}
              label={`${wine.country} · ${wine.regionName}`}
              className="h-full w-full"
            />
          )}
        </div>

        {/* 오른쪽: 상세 패널 */}
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-3xl border border-foreground/12 bg-card/75 p-6 shadow-lg shadow-foreground/10 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-4 w-4 rounded-full border border-foreground/20"
                style={{ background: wine.color }}
              />
              <span className="text-xs uppercase tracking-wide text-muted">
                {typeLabel(wine.type)}
              </span>
            </div>
            <h2 className="mt-1 font-serif text-2xl text-foreground">{wine.nameKo}</h2>
            <p className="text-sm text-muted">{wine.nameLocal}</p>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted">품종</dt>
            <dd className="text-foreground">{wine.grape}</dd>
            <dt className="text-muted">산지</dt>
            <dd className="text-foreground">
              {wine.country} · {wine.regionName}
            </dd>
          </dl>

          <p className="text-sm leading-relaxed text-foreground/85">{wine.notesKo}</p>

          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">푸드 페어링</p>
            <div className="flex flex-wrap gap-1.5">
              {wine.foodPairing.map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-foreground/12 bg-foreground/5 px-2.5 py-1 text-xs text-foreground/80"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-auto rounded-full border border-foreground/20 px-4 py-2 text-xs text-muted transition-colors hover:text-foreground"
          >
            ← 처음으로
          </button>
        </aside>
      </div>
    </div>
  );
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    red: "레드",
    white: "화이트",
    rose: "로제",
    sparkling: "스파클링",
    dessert: "디저트",
    fortified: "주정강화",
  };
  return map[type] ?? type;
}
