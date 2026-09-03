"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { adminHeaders, useAuthStore } from "@/features/admin/auth-store";
import { hexToAbsorb } from "@/features/wine/wine-glass";

const FluidLab = dynamic(() => import("./FluidLab"), {
  ssr: false,
  loading: () => null,
});

// 대표 와인잔 형태(FluidLab 의 GLASSES 순서와 일치). 와인→잔 자동 매핑의 인덱스.
const GLASS = {
  universal: 0,
  bordeaux: 1,
  burgundy: 2,
  white: 3,
  flute: 4,
  dessert: 5,
};
const GLASS_OPTIONS: { label: string; desc: string }[] = [
  { label: "표준", desc: "만능형" },
  { label: "보르도", desc: "풀바디 레드" },
  { label: "부르고뉴", desc: "피노 누아" },
  { label: "화이트", desc: "샤르도네·소비뇽블랑" },
  { label: "플루트", desc: "샴페인·스파클링" },
  { label: "디저트", desc: "아이스와인·포트" },
];

// 대표 색 프리셋. color = 컬러피커 초기값(눈에 보이는 색), glass = 어울리는 잔.
type Preset = { name: string; color: string; glass: number };
const WINE_PRESETS: Preset[] = [
  { name: "카베르네 소비뇽", color: "#4a0f1a", glass: GLASS.bordeaux },
  { name: "메를로", color: "#5a1122", glass: GLASS.bordeaux },
  { name: "피노 누아", color: "#7c1f2c", glass: GLASS.burgundy },
  { name: "시라", color: "#3a0a15", glass: GLASS.bordeaux },
  { name: "산지오베제", color: "#611423", glass: GLASS.burgundy },
  { name: "로제", color: "#e59aa4", glass: GLASS.white },
  { name: "로제 샴페인", color: "#f0b8c0", glass: GLASS.flute },
  { name: "샤르도네", color: "#ecd88f", glass: GLASS.white },
  { name: "소비뇽 블랑", color: "#e7e0a6", glass: GLASS.white },
  { name: "샴페인", color: "#f1e7b4", glass: GLASS.flute },
  { name: "아이스와인", color: "#cf8f2a", glass: GLASS.dessert },
];

// 와인 페이지(WineDetailView)와 같은 평평한 웜톤 배경. HDR 을 그대로 쓰면 위쪽이
// 어두운 회색 천장 영역으로 그라데이션 져 지저분하다. 프리뷰는 이 단색을 쓴다.
const CANVAS_BG = "#9a8168";
const CANVAS_RENDERED = "#bda588";

type WineRow = {
  slug: string;
  nameKo: string;
  nameLocal: string | null;
  type: string | null;
  colorHex: string | null;
};

export default function FluidLabMount() {
  const [color, setColor] = useState<string>(WINE_PRESETS[1].color); // 현재 색(프리셋 or 커스텀)
  const [glassIdx, setGlassIdx] = useState(WINE_PRESETS[1].glass);
  const [slideX, setSlideX] = useState(0); // 잔 x 슬라이드 검증(-3~3, 0=중앙)
  const [wines, setWines] = useState<WineRow[]>([]);
  const [selSlug, setSelSlug] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const isAdmin = useAuthStore((s) => !!s.password);
  // 두 잔 검증용 imperative 핸들(FluidLab.onReady 로 받음).
  type LabApi = {
    addGlass: (
      glassType: number,
      absorb?: [number, number, number],
      fromDir?: "left" | "right"
    ) => void;
    slideOut: (dir: "left" | "right") => void;
    getCount: () => number;
  };
  const apiRef = useRef<LabApi | null>(null);
  const [glassCount, setGlassCount] = useState(1);
  const refreshCount = () => {
    if (apiRef.current) setGlassCount(apiRef.current.getCount());
  };

  // 색 도구용 와인 목록.
  useEffect(() => {
    fetch("/api/wines")
      .then((r) => r.json())
      .then((d) => setWines(d.wines ?? []))
      .catch(() => {});
  }, []);

  const absorb = hexToAbsorb(color) ?? [16, 78, 98];

  const pickPreset = (p: Preset) => {
    setColor(p.color);
    setGlassIdx(p.glass);
  };
  const pickWine = (slug: string) => {
    setSelSlug(slug);
    const w = wines.find((x) => x.slug === slug);
    if (w?.colorHex) setColor(w.colorHex);
    setSaveState("idle");
  };
  const save = async () => {
    if (!selSlug) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/wines/color", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ slug: selSlug, colorHex: color }),
      });
      setSaveState(res.ok ? "saved" : "error");
      setWines((ws) => ws.map((w) => (w.slug === selSlug ? { ...w, colorHex: color } : w)));
    } catch {
      setSaveState("error");
    }
    setTimeout(() => setSaveState("idle"), 2500);
  };

  return (
    <div className="relative h-full w-full" style={{ backgroundColor: CANVAS_RENDERED }}>
      <FluidLab
        wineAbsorb={absorb}
        glassType={glassIdx}
        bgColor={CANVAS_BG}
        slideX={slideX}
        onReady={(api) => {
          apiRef.current = api;
          setGlassCount(api.getCount());
        }}
      />

      {/* slideX 검증 + 두 잔 검증 (상단 중앙) */}
      <div className="-translate-x-1/2 absolute top-3 left-1/2 z-10 flex w-72 max-w-[70vw] flex-col items-center gap-2 rounded-2xl border border-white/20 bg-black/45 p-3 backdrop-blur">
        <span className="font-mono text-[11px] text-white/80">
          slideX = {slideX.toFixed(2)} · 잔 {glassCount}개
        </span>
        <input
          type="range"
          min={-3}
          max={3}
          step={0.05}
          value={slideX}
          onChange={(e) => setSlideX(Number(e.target.value))}
          aria-label="slideX"
          className="w-full"
        />
        <button
          type="button"
          onClick={() => setSlideX(0)}
          className="rounded border border-white/25 px-2 py-0.5 text-[11px] text-white/70 hover:text-white"
        >
          가운데(0)
        </button>
        {/* 두 잔 검증: 반대편에서 잔을 넣거나(각자 출렁), 컨베이어처럼 교차시킨다. */}
        <div className="flex w-full flex-wrap justify-center gap-1.5 border-white/15 border-t pt-2">
          <button
            type="button"
            onClick={() => {
              apiRef.current?.addGlass(glassIdx, absorb, "left");
              refreshCount();
            }}
            className="rounded border border-white/25 px-2 py-0.5 text-[11px] text-white/80 hover:text-white"
          >
            잔 추가(왼쪽에서)
          </button>
          <button
            type="button"
            onClick={() => {
              apiRef.current?.addGlass(glassIdx, absorb, "right");
              refreshCount();
            }}
            className="rounded border border-white/25 px-2 py-0.5 text-[11px] text-white/80 hover:text-white"
          >
            잔 추가(오른쪽에서)
          </button>
          <button
            type="button"
            onClick={() => {
              // 컨베이어 교차: 기존 잔을 왼쪽으로 내보내고 새 잔을 오른쪽에서 넣는다.
              apiRef.current?.slideOut("left");
              apiRef.current?.addGlass(glassIdx, absorb, "right");
              refreshCount();
            }}
            className="rounded border border-white/40 bg-white/10 px-2 py-0.5 text-[11px] text-white hover:bg-white/20"
          >
            교차 슬라이드
          </button>
        </div>
      </div>

      {/* 작은 프리뷰 — 와인 페이지와 같은 평평한 웜 배경(HDR 그라데이션 없이 깔끔). */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col items-center gap-1">
        <div
          className="relative h-72 w-52 overflow-hidden rounded-2xl border border-white/25"
          style={{ backgroundColor: CANVAS_RENDERED }}
        >
          <FluidLab wineAbsorb={absorb} glassType={glassIdx} bgColor={CANVAS_BG} swirlScale={0.4} />
        </div>
        <span className="rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white/70 backdrop-blur">
          작은 잔 (와인 페이지 배경)
        </span>
      </div>

      {/* 색 프리셋 (좌상) */}
      <div className="absolute left-3 top-3 z-10 flex max-w-[62vw] flex-wrap gap-1.5">
        {WINE_PRESETS.map((w) => (
          <button
            type="button"
            key={w.name}
            onClick={() => pickPreset(w)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs backdrop-blur transition-colors ${
              color === w.color
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

      {/* 색 맞추기 (우상) — 컬러피커 + (관리자) 와인에 저장 */}
      <div className="absolute right-3 top-3 z-10 flex w-52 max-w-[44vw] flex-col gap-2 rounded-2xl border border-white/20 bg-black/45 p-3 backdrop-blur">
        <label className="flex items-center gap-2 text-xs text-white/80">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="와인 색"
            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-white/30 bg-transparent"
          />
          <span className="font-mono">{color}</span>
        </label>
        {isAdmin ? (
          <div className="flex flex-col gap-1.5">
            <select
              value={selSlug}
              onChange={(e) => pickWine(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-white"
            >
              <option value="">와인 선택…</option>
              {wines.map((w) => (
                <option key={w.slug} value={w.slug} className="text-black">
                  {(w.nameLocal ?? w.nameKo) + (w.colorHex ? " ●" : "")}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={save}
              disabled={!selSlug || saveState === "saving"}
              className="rounded-lg border border-white/30 bg-white/10 px-2 py-1.5 text-xs text-white transition-colors hover:bg-white/20 disabled:opacity-40"
            >
              {saveState === "saving"
                ? "저장 중…"
                : saveState === "saved"
                  ? "저장됨 ✓"
                  : saveState === "error"
                    ? "실패"
                    : "이 색으로 저장"}
            </button>
          </div>
        ) : (
          <p className="text-[11px] leading-snug text-white/50">
            로그인하면 이 색을 와인에 저장할 수 있어요.
          </p>
        )}
      </div>

      {/* 잔 형태 (좌하) */}
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
