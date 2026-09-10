"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HOME_GLASS, useGlassOptional } from "@/features/glass/glass-context";
import {
  NAME_DELAY_S,
  NAME_LEAD_S,
  RESUME_AFTER_TOUCH_S,
  rotationOrder,
  WINE_HOLD_S,
} from "@/features/glass/rotation";
import type { RotationWine } from "@/features/wine/db/queries";

// 홈 랜딩: 검색바·헤더·와인잔·배경은 (main) 레이아웃이 제공한다. 여기선 어떤 와인을
// 보여 줄지 정하고(순환), 잔 아래 이름을 얹고, 푸터를 둔다.
//
// 잔을 직접 바꾸지 않는다 — 잔 상태(setGlass)만 갈아 끼우면 GlassStage 가 "같은
// 페이지에서 잔이 달라졌다"를 보고 교차 슬라이드로 바꿔 준다. 리듬 상수는 rotation.ts.

/** 이름이 미끄러져 들어오고 나가는 시간(ms). 잔 슬라이드와 결이 맞는 정도로. */
const NAME_MOVE_MS = 420;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export default function WineShowcase({ wines }: { wines: RotationWine[] }) {
  const ctx = useGlassOptional();
  const setGlass = ctx?.setGlass;
  const touchedAt = ctx?.touchedAt;
  const lastHomeWine = ctx?.lastHomeWine;
  const reduced = useReducedMotion();

  const [wine, setWine] = useState<RotationWine | null>(null);
  const [nameIn, setNameIn] = useState(false);
  const year = new Date().getFullYear();

  // biome-ignore lint/correctness/useExhaustiveDependencies: 순환은 마운트 때 한 번만 짠다
  useEffect(() => {
    if (!setGlass || wines.length === 0) return;
    const order = rotationOrder(wines, Math.random, lastHomeWine?.current);
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const wait = (ms: number, fn: () => void) => {
      timer = setTimeout(fn, ms);
    };

    const show = (w: RotationWine) => {
      setWine(w);
      if (lastHomeWine) lastHomeWine.current = w.slug;
      setGlass({ absorb: w.absorb, glass: w.glass, swirlScale: HOME_GLASS.swirlScale, abv: w.abv });
      wait(NAME_DELAY_S * 1000, () => setNameIn(true));
    };

    show(order[0]);
    // 움직임을 줄이려는 사용자에겐 한 잔만 보여 주고 교체하지 않는다.
    if (!reduced && order.length > 1) scheduleNext();

    function scheduleNext() {
      wait(WINE_HOLD_S * 1000, tick);
    }

    function tick() {
      // 잔을 만지는 중이거나 방금 만졌으면 기다린다. 탭이 뒤에 있어도 마찬가지 —
      // 안 보이는 동안 넘기면 돌아왔을 때 엉뚱한 와인이 떠 있다.
      const idleFor = performance.now() - (touchedAt?.current ?? 0);
      if (document.hidden || idleFor < RESUME_AFTER_TOUCH_S * 1000) {
        wait(1000, tick);
        return;
      }
      setNameIn(false); // 이름이 먼저 빠지고
      wait(NAME_LEAD_S * 1000, () => {
        i = (i + 1) % order.length;
        show(order[i]); // 잔이 뒤따라 바뀐다
        scheduleNext();
      });
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [setGlass, wines, reduced]);

  return (
    <>
      {wine ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-[80vh] z-20 flex justify-center px-6"
          aria-live="off"
        >
          <Link
            href={`/wine/${wine.slug}`}
            // 미끄러지는 동안은 누를 수 없게 — 누르려는 순간 다른 와인으로 바뀌어
            // 엉뚱한 페이지로 가는 걸 막는다.
            className={`rounded-2xl px-4 py-2 text-center transition-all ease-out ${
              nameIn ? "pointer-events-auto translate-x-0 opacity-100" : "translate-x-6 opacity-0"
            }`}
            style={{ transitionDuration: `${NAME_MOVE_MS}ms` }}
            tabIndex={nameIn ? undefined : -1}
          >
            <span className="block font-serif text-lg text-foreground md:text-xl">
              {wine.nameKo}
            </span>
            {wine.origin ? (
              <span className="mt-0.5 block text-xs text-muted">{wine.origin}</span>
            ) : null}
          </Link>
        </div>
      ) : null}
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
