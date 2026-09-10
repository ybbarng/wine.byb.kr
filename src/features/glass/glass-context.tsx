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
  /** 홈 순환이 마지막으로 보여 준 와인 slug. 상세를 다녀와도 거기서 이어지게. */
  lastHomeWine: RefObject<string | null>;
};
const GlassContext = createContext<Ctx | null>(null);

export function GlassProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlassState>(HOME_GLASS);
  const [revealContent, setRevealContent] = useState(true);
  const touchedAt = useRef(0);
  const lastHomeWine = useRef<string | null>(null);
  const noteTouch = useCallback(() => {
    touchedAt.current = performance.now();
  }, []);
  const value = useMemo(
    () => ({
      state,
      setGlass: setState,
      revealContent,
      setRevealContent,
      touchedAt,
      noteTouch,
      lastHomeWine,
    }),
    [state, revealContent, noteTouch]
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
