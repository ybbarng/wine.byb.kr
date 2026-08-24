"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const FluidLab = dynamic(() => import("./FluidLab"), {
  ssr: false,
  loading: () => null,
});

// 대표 와인잔 형태(FluidLab 의 GLASSES 순서와 일치). 와인→잔 자동 매핑의 인덱스.
const GLASS = { universal: 0, bordeaux: 1, burgundy: 2, white: 3, flute: 4 };
const GLASS_OPTIONS: { label: string; desc: string }[] = [
  { label: "표준", desc: "만능형" },
  { label: "보르도", desc: "풀바디 레드" },
  { label: "부르고뉴", desc: "피노 누아" },
  { label: "화이트", desc: "샤르도네·소비뇽블랑" },
  { label: "플루트", desc: "샴페인·스파클링" },
];

// 대표 와인 프리셋. absorb = Beer–Lambert 흡수계수(R 적게·G/B 많이 → 붉은색,
// B 만 많이 → 노란 화이트). glass = 어울리는 잔(선택 시 색과 함께 자동 전환).
type Preset = {
  name: string;
  absorb: [number, number, number];
  color: string;
  glass: number;
};
const WINE_PRESETS: Preset[] = [
  { name: "카베르네 소비뇽", absorb: [13, 60, 80], color: "#3f0e1c", glass: GLASS.bordeaux },
  { name: "메를로", absorb: [16, 78, 98], color: "#5a1122", glass: GLASS.bordeaux },
  { name: "피노 누아", absorb: [9, 40, 52], color: "#7c1f2c", glass: GLASS.burgundy },
  { name: "시라", absorb: [11, 55, 72], color: "#340a18", glass: GLASS.bordeaux },
  { name: "산지오베제", absorb: [14, 66, 78], color: "#611423", glass: GLASS.burgundy },
  { name: "로제", absorb: [3.5, 10, 8.5], color: "#e59aa4", glass: GLASS.white },
  { name: "샤르도네", absorb: [1.6, 3.2, 13], color: "#ecd88f", glass: GLASS.white },
  { name: "소비뇽 블랑", absorb: [1.3, 2.4, 11], color: "#e7e0a6", glass: GLASS.white },
  { name: "샴페인", absorb: [1.4, 3.0, 12], color: "#f1e7b4", glass: GLASS.flute },
];

export default function FluidLabMount() {
  const [idx, setIdx] = useState(1); // 메를로 기본
  // 잔은 선택 와인에 맞춰 자동 전환(수동 변경도 허용).
  const [glassIdx, setGlassIdx] = useState(WINE_PRESETS[1].glass);

  const pickWine = (i: number) => {
    setIdx(i);
    setGlassIdx(WINE_PRESETS[i].glass); // 색과 잔 함께 전환
  };

  return (
    <div className="relative h-full w-full">
      <FluidLab wineAbsorb={WINE_PRESETS[idx].absorb} glassType={glassIdx} />
      {/* 와인 프리셋 컨트롤러 (lab) — 고르면 색+잔 함께 전환 */}
      <div className="absolute left-3 top-3 z-10 flex max-w-[92vw] flex-wrap gap-1.5">
        {WINE_PRESETS.map((w, i) => (
          <button
            type="button"
            key={w.name}
            onClick={() => pickWine(i)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs backdrop-blur transition-colors ${
              i === idx
                ? "border-white/70 bg-black/50 text-white"
                : "border-white/20 bg-black/25 text-white/70 hover:text-white"
            }`}
          >
            <span
              className="h-3 w-3 rounded-full border border-white/30"
              style={{ background: w.color }}
            />
            {w.name}
          </button>
        ))}
      </div>
      {/* 와인잔 형태 컨트롤러 (lab) — 수동 변경(자동 매핑 덮어쓰기) */}
      <div className="absolute bottom-3 left-3 z-10 flex max-w-[92vw] flex-wrap gap-1.5">
        {GLASS_OPTIONS.map((g, i) => (
          <button
            type="button"
            key={g.label}
            onClick={() => setGlassIdx(i)}
            title={g.desc}
            className={`rounded-full border px-2.5 py-1 text-xs backdrop-blur transition-colors ${
              i === glassIdx
                ? "border-white/70 bg-black/50 text-white"
                : "border-white/20 bg-black/25 text-white/70 hover:text-white"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}
