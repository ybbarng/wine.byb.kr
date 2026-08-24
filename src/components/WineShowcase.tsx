"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { RegionMap } from "@/features/wine/region-map";
import {
  type ShowcaseWine,
  SHOWCASE_WINES,
} from "@/features/wine/showcase-wines";

// 글라스 캔버스는 하나만 유지하고 컨테이너를 transform 으로만 옮긴다(리사이즈 없이
// 중앙→좌측으로 미끄러짐 → 스월·색 이어짐). ssr 불가(WebGPU).
const FluidLab = dynamic(() => import("./FluidLab"), {
  ssr: false,
  loading: () => null,
});

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
        w.grape.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [query]);

  const pick = (w: ShowcaseWine) => {
    setSelected(w);
    setQuery("");
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
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
            className="w-full rounded-full border border-white/15 bg-black/30 px-5 py-2.5 text-sm text-foreground backdrop-blur placeholder:text-white/40 focus:border-white/40 focus:outline-none"
          />
          {results.length > 0 && (
            <ul className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-black/80 p-1 backdrop-blur">
              {results.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => pick(w)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-white/20"
                      style={{ background: w.color }}
                    />
                    <span className="text-foreground">{w.nameKo}</span>
                    <span className="text-white/40">· {w.regionName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="hidden w-24 shrink-0 sm:block" />
      </header>

      {/* ── 글라스(유지·이동) ── 중앙(랜딩) ↔ 좌측(검색 후). transform 만 바뀜. */}
      <div
        className="absolute left-0 top-0 z-20 h-[82vh] w-[46vh] transition-transform duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          transformOrigin: "top left",
          transform: searched
            ? "translate(2.5vw, 12vh) scale(0.66)"
            : "translate(calc(50vw - 23vh), 9vh) scale(1)",
        }}
      >
        <FluidLab wineAbsorb={wine.absorb} glassType={wine.glass} />
      </div>

      {/* ── 랜딩 카피 + 빠른 칩(검색 전) ── */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-[8vh] z-10 flex flex-col items-center gap-4 px-6 text-center transition-opacity duration-500 ${
          searched ? "opacity-0" : "opacity-100"
        }`}
      >
        <p className="max-w-md text-sm text-rose/70">
          한 병의 뒷이야기를 색과 산지로. 마음에 드는 와인을 검색해 보세요.
        </p>
        <div className="pointer-events-auto flex flex-wrap justify-center gap-1.5">
          {SHOWCASE_WINES.slice(0, 6).map((w) => (
            <button
              type="button"
              key={w.id}
              onClick={() => pick(w)}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-xs text-white/70 backdrop-blur transition-colors hover:text-white"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: w.color }}
              />
              {w.nameKo}
            </button>
          ))}
        </div>
      </div>

      {/* ── 지도 + 상세(검색 후) ── 오른쪽에서 페이드인 ── */}
      <div
        className={`absolute inset-y-0 right-0 z-10 flex w-[66vw] items-stretch gap-4 py-20 pl-2 pr-6 transition-all duration-700 ${
          searched
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-8 opacity-0"
        }`}
      >
        {/* 중앙: 산지 지도 */}
        <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/10">
          {searched && (
            <RegionMap
              key={wine.id}
              country={wine.country}
              regionName={wine.regionName}
              fallback={wine.fallback}
              label={`${wine.country} · ${wine.regionName}`}
            />
          )}
        </div>

        {/* 오른쪽: 상세 패널 */}
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-3xl border border-white/10 bg-black/25 p-6 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-4 w-4 rounded-full border border-white/20"
                style={{ background: wine.color }}
              />
              <span className="text-xs uppercase tracking-wide text-white/40">
                {typeLabel(wine.type)}
              </span>
            </div>
            <h2 className="mt-1 font-serif text-2xl text-foreground">
              {wine.nameKo}
            </h2>
            <p className="text-sm text-white/40">{wine.nameLocal}</p>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-white/40">품종</dt>
            <dd className="text-white/85">{wine.grape}</dd>
            <dt className="text-white/40">산지</dt>
            <dd className="text-white/85">
              {wine.country} · {wine.regionName}
            </dd>
          </dl>

          <p className="text-sm leading-relaxed text-white/75">{wine.notesKo}</p>

          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-white/40">
              푸드 페어링
            </p>
            <div className="flex flex-wrap gap-1.5">
              {wine.foodPairing.map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-auto rounded-full border border-white/15 px-4 py-2 text-xs text-white/60 transition-colors hover:text-white"
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
