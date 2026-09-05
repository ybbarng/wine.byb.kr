"use client";

import { HexColorInput, HexColorPicker } from "react-colorful";

// 와인 색 프리셋(눈에 보이는 색). 노트 폼·마법사가 공유한다.
export const WINE_COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "짙은 레드", hex: "#4a0f1a" },
  { name: "루비", hex: "#7c1f2c" },
  { name: "로제", hex: "#e59aa4" },
  { name: "화이트", hex: "#ecd88f" },
  { name: "옅은 골드", hex: "#f1e7b4" },
];

// 와인 색 인라인 피커. 네이티브 <input type="color">(OS 모달)와 달리, 현재 색 위치에
// 조절점이 놓인 채펴져 있어 "지금 색에서 미세 조정"이 쉽다. 드래그하면 onChange 가
// 연속 발생해 옆 잔 프리뷰가 실시간으로 바뀐다. color 는 항상 유효한 #rrggbb 여야 한다
// (저장색 또는 와인 종류 추정색). showClear=true 면 "지우기"로 색을 비운다(종류 추정색으로).
export function WineColorPicker({
  color,
  onChange,
  onClear,
  showClear = false,
}: {
  color: string;
  onChange: (hex: string) => void;
  onClear?: () => void;
  showClear?: boolean;
}) {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <HexColorPicker color={color} onChange={onChange} style={{ width: "100%", height: 150 }} />
      <div className="flex items-center gap-2">
        <span
          className="h-6 w-6 shrink-0 rounded border border-foreground/20"
          style={{ background: color }}
        />
        <HexColorInput
          color={color}
          onChange={onChange}
          prefixed
          aria-label="와인 색 (hex)"
          className="w-28 rounded-lg border border-foreground/20 bg-card/60 px-2 py-1 font-mono text-sm text-foreground uppercase outline-none transition-colors focus:border-gold/50"
        />
        {showClear && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted/60 transition-colors hover:text-foreground"
          >
            지우기
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {WINE_COLOR_PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            onClick={() => onChange(p.hex)}
            title={p.name}
            className="flex items-center gap-1 rounded-full border border-foreground/15 px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            <span
              className="h-3 w-3 rounded-full border border-foreground/20"
              style={{ background: p.hex }}
            />
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
