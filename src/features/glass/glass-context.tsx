"use client";

// 홈·상세가 공유하는 "떠 있는 와인잔" 상태. (main) 레이아웃이 FluidLab 을 한 번만
// 마운트하고, 각 페이지는 GlassSetter 로 현재 잔(색·잔 종류)만 갈아끼운다. 이렇게 하면
// 페이지를 옮겨도 잔이 재초기화되지 않고, 위치만 CSS 로 옮겨 자연스럽게 이동한다.
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

export type GlassState = {
  absorb: [number, number, number];
  glass: number;
  swirlScale: number;
};

// 홈 기본 잔(메를로 색·보르도 잔). 상세에서 홈으로 돌아오면 이 값으로 복귀한다.
export const HOME_GLASS: GlassState = { absorb: [16, 78, 98], glass: 1, swirlScale: 0.8 };

type Ctx = { state: GlassState; setGlass: (s: GlassState) => void };
const GlassContext = createContext<Ctx | null>(null);

export function GlassProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlassState>(HOME_GLASS);
  return (
    <GlassContext.Provider value={{ state, setGlass: setState }}>{children}</GlassContext.Provider>
  );
}

/** (main) 셸 안에서만 유효. 셸 밖(producer/journal 등)에서는 null 을 반환한다. */
export function useGlassOptional(): Ctx | null {
  return useContext(GlassContext);
}

/**
 * 페이지에서 현재 잔 상태를 셸에 주입한다. 렌더 출력 없음.
 * 셸(GlassProvider) 밖에서 호출되면 아무 일도 하지 않는다(안전).
 */
export function GlassSetter({ absorb, glass, swirlScale }: GlassState) {
  const ctx = useGlassOptional();
  const setGlass = ctx?.setGlass;
  const [r, g, b] = absorb;
  useEffect(() => {
    setGlass?.({ absorb: [r, g, b], glass, swirlScale });
  }, [r, g, b, glass, swirlScale, setGlass]);
  return null;
}
