"use client";

// 홈·상세가 공유하는 "떠 있는 와인잔" 상태. (main) 레이아웃이 FluidLab 을 한 번만
// 마운트하고, 각 페이지는 GlassSetter 로 현재 잔(색·잔 종류)만 갈아끼운다. 이렇게 하면
// 페이지를 옮겨도 잔이 재초기화되지 않고, 위치만 CSS 로 옮겨 자연스럽게 이동한다.
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RotationWine } from "@/features/wine/db/queries";

export type GlassState = {
  absorb: [number, number, number];
  glass: number;
  swirlScale: number;
  /** 도수(%). 눈물자국의 세기·속도를 정한다. 모르면 null(흔한 식탁 와인으로 본다). */
  abv: number | null;
};

// 홈 기본 잔(메를로 색·보르도 잔). 상세에서 홈으로 돌아오면 이 값으로 복귀한다.
export const HOME_GLASS: GlassState = {
  absorb: [16, 78, 98],
  glass: 1,
  swirlScale: 0.8,
  abv: null,
};

type Ctx = {
  state: GlassState;
  setGlass: (s: GlassState) => void;
  // 상세 콘텐츠(지도·글)를 화면에 보일지. 홈→상세 진입 때 창(캔버스)이 왼쪽으로
  // 이동하는 동안은 false 로 숨겨 겹침을 막고, 이동이 끝나면 true 로 fade-in 한다.
  revealContent: boolean;
  setRevealContent: (v: boolean) => void;
  /** 잔을 마지막으로 만진 시각(performance.now). 홈 순환이 이걸 보고 기다린다. */
  touchedAt: RefObject<number>;
  /** 잔을 만졌다고 알린다. 리렌더를 만들지 않으려고 ref 로 둔다. */
  noteTouch: () => void;
  /**
   * 홈 순환 상태 — 섞어 둔 순서와 어디까지 왔는지.
   *
   * 홈 화면은 페이지를 옮길 때마다 다시 마운트되지만 셸은 살아 있다. 그래서 여기에
   * 둔다 — 상세를 다녀와도 순서가 다시 섞이지 않고 그 자리에서 이어진다.
   * `i = -1` 은 아직 기본 잔(이름 없음)이라는 뜻이다.
   */
  rotation: RefObject<{ order: readonly RotationWine[]; i: number } | null>;
  /**
   * 잔이 실제로 미끄러지기 시작할 때마다 오르는 수.
   *
   * 잔 상태를 바꾼 시각과 잔이 움직이기 시작하는 시각은 다르다 — 첫 교체는 FluidLab
   * 초기화(WebGPU)를 기다렸다가 움직인다. 이름을 잔에 맞춰 얹으려면 "상태를 바꾼 때"가
   * 아니라 이 시점을 기준으로 삼아야 한다.
   */
  swapSeq: number;
  /** GlassStage 가 잔을 밀어내기 직전에 부른다. */
  noteSwap: () => void;
};
const GlassContext = createContext<Ctx | null>(null);

/** 순환 와인 한 종을 잔 상태로. */
export function glassFor(w: RotationWine): GlassState {
  return { absorb: w.absorb, glass: w.glass, swirlScale: HOME_GLASS.swirlScale, abv: w.abv };
}

export function GlassProvider({ children }: { children: ReactNode }) {
  const rotation = useRef<{ order: readonly RotationWine[]; i: number } | null>(null);
  const [state, setState] = useState<GlassState>(HOME_GLASS);
  const [revealContent, setRevealContent] = useState(true);
  const touchedAt = useRef(0);
  const [swapSeq, setSwapSeq] = useState(0);
  const noteTouch = useCallback(() => {
    touchedAt.current = performance.now();
  }, []);
  const noteSwap = useCallback(() => setSwapSeq((n) => n + 1), []);
  const value = useMemo(
    () => ({
      state,
      setGlass: setState,
      revealContent,
      setRevealContent,
      touchedAt,
      noteTouch,
      rotation,
      swapSeq,
      noteSwap,
    }),
    [state, revealContent, noteTouch, swapSeq, noteSwap]
  );
  return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}

/** (main) 셸 안에서만 유효. 셸 밖(producer/journal 등)에서는 null 을 반환한다. */
export function useGlassOptional(): Ctx | null {
  return useContext(GlassContext);
}

/**
 * 페이지에서 현재 잔 상태를 셸에 주입한다. 렌더 출력 없음.
 * 셸(GlassProvider) 밖에서 호출되면 아무 일도 하지 않는다(안전).
 */
export function GlassSetter({ absorb, glass, swirlScale, abv }: GlassState) {
  const ctx = useGlassOptional();
  const setGlass = ctx?.setGlass;
  const [r, g, b] = absorb;
  useEffect(() => {
    setGlass?.({ absorb: [r, g, b], glass, swirlScale, abv });
  }, [r, g, b, glass, swirlScale, abv, setGlass]);
  return null;
}
