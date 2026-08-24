"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const FluidLab = dynamic(() => import("./FluidLab"), {
  ssr: false,
  loading: () => null,
});

// 대표 와인 프리셋. absorb = Beer–Lambert 흡수계수(R 적게·G/B 많이 → 붉은색,
// B 만 많이 → 노란 화이트). color = 버튼 스와치(대략 색). 시음 대표군을 골랐다.
type Preset = {
  name: string;
  absorb: [number, number, number];
  color: string;
};
const WINE_PRESETS: Preset[] = [
  { name: "카베르네 소비뇽", absorb: [13, 60, 80], color: "#3f0e1c" },
  { name: "메를로", absorb: [16, 78, 98], color: "#5a1122" },
  { name: "피노 누아", absorb: [9, 40, 52], color: "#7c1f2c" },
  { name: "시라", absorb: [11, 55, 72], color: "#340a18" },
  { name: "산지오베제", absorb: [14, 66, 78], color: "#611423" },
  { name: "로제", absorb: [3.5, 10, 8.5], color: "#e59aa4" },
  { name: "샤르도네", absorb: [1.6, 3.2, 13], color: "#ecd88f" },
  { name: "소비뇽 블랑", absorb: [1.3, 2.4, 11], color: "#e7e0a6" },
];

// 대표 와인잔 형태(FluidLab 의 GLASSES 순서와 일치). 나중에 와인→잔 자동 매핑에 사용.
const GLASS_OPTIONS: { label: string; desc: string }[] = [
  { label: "표준", desc: "만능형" },
  { label: "보르도", desc: "풀바디 레드" },
  { label: "부르고뉴", desc: "피노 누아" },
  { label: "화이트", desc: "샤르도네·소비뇽블랑" },
  { label: "플루트", desc: "샴페인·스파클링" },
];

export default function FluidLabMount() {
  const [idx, setIdx] = useState(1); // 메를로 기본
  const [glassIdx, setGlassIdx] = useState(0); // 표준 잔 기본

  return (
    <div className="relative h-full w-full">
      <FluidLab wineAbsorb={WINE_PRESETS[idx].absorb} glassType={glassIdx} />
      {/* 와인 프리셋 컨트롤러 (lab) */}
      <div className="absolute left-3 top-3 z-10 flex max-w-[92vw] flex-wrap gap-1.5">
        {WINE_PRESETS.map((w, i) => (
          <button
            type="button"
            key={w.name}
            onClick={() => setIdx(i)}
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
      {/* 와인잔 형태 컨트롤러 (lab) */}
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
