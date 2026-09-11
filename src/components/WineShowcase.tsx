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

/**
 * 이름은 잔과 **같은 방향**으로 움직여야 한 덩어리로 보인다. 잔은 왼쪽으로 나가고
 * 새 잔이 오른쪽에서 들어오므로, 이름도 왼쪽으로 빠지고 오른쪽에서 들어온다.
 * 그래서 상태가 셋이다 — 둘(보임/안 보임)로 두면 나갈 때도 들어온 쪽으로 되돌아간다.
 *
 * `enter` 는 오른쪽 바깥에 **즉시** 갖다 놓는 자리라 전환을 끈다. 안 끄면 왼쪽 끝에서
 * 오른쪽 끝까지 미끄러지는 동작이 먼저 일어나(투명해서 안 보여도) 다음 등장이 어긋난다.
 */
type NamePhase = "enter" | "shown" | "exit";

const NAME_CLASS: Record<NamePhase, string> = {
  enter: "translate-x-6 opacity-0 transition-none",
  shown: "translate-x-0 opacity-100",
  exit: "-translate-x-6 opacity-0",
};

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
  const swapSeq = ctx?.swapSeq ?? 0;
  const reduced = useReducedMotion();

  const [wine, setWine] = useState<RotationWine | null>(null);
  const [phase, setPhase] = useState<NamePhase>("enter");
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
      setPhase("enter"); // 오른쪽 바깥에 갖다 놓는다. 등장 시점은 아래 효과가 잡는다.
      if (lastHomeWine) lastHomeWine.current = w.slug;
      setGlass({ absorb: w.absorb, glass: w.glass, swirlScale: HOME_GLASS.swirlScale, abv: w.abv });
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
      setPhase("exit"); // 이름이 먼저 왼쪽으로 빠지고
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

  // 이름은 **잔이 실제로 미끄러지기 시작한 뒤** 얹는다.
  //
  // 잔 상태를 바꾼 시각과 잔이 움직이기 시작하는 시각이 늘 같지는 않다 — 첫 교체는
  // FluidLab 초기화(WebGPU)를 기다렸다가 움직인다. 상태 변경을 기준으로 세면 그 첫
  // 번째만 이름이 먼저 떠 잔과 따로 놀았다. swapSeq 는 잔이 밀려나는 순간에 오른다.
  //
  // wine 도 함께 보는 건 안전판이다 — 잔이 끝내 안 움직이는 경우(색·잔이 같아 교체가
  // 생략되는 등)에도 이름은 떠야 한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: swapSeq 는 읽는 값이 아니라 "잔이 밀리기 시작했다"는 신호다. 그때 타이머를 다시 잡으려고 일부러 넣는다.
  useEffect(() => {
    if (!wine) return;
    const t = setTimeout(() => setPhase("shown"), NAME_DELAY_S * 1000);
    return () => clearTimeout(t);
  }, [wine, swapSeq]);

  return (
    <>
      {/* 첫 와인이 정해지기 전에도 자리를 만들어 둔다. 이름이 생길 때 노드가 같이
          생기면 첫 등장만 출발점이 달라, 미끄러지지 않고 그냥 나타나 보인다.
          빈 칸(&nbsp;)으로 높이도 미리 잡아 두어 글이 들어올 때 밀리지 않는다. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-[80vh] z-20 flex justify-center px-6"
        aria-hidden={wine == null}
      >
        <Link
          data-testid="home-wine-name"
          href={wine ? `/wine/${wine.slug}` : "/"}
          // 미끄러지는 동안은 누를 수 없게 — 누르려는 순간 다른 와인으로 바뀌어
          // 엉뚱한 페이지로 가는 걸 막는다.
          className={`rounded-2xl px-4 py-2 text-center transition-all ease-out ${
            phase === "shown" && wine ? "pointer-events-auto " : ""
          }${NAME_CLASS[phase]}`}
          style={{ transitionDuration: `${NAME_MOVE_MS}ms` }}
          tabIndex={phase === "shown" && wine ? undefined : -1}
        >
          <span className="block font-serif text-lg text-foreground md:text-xl">
            {wine?.nameKo ?? " "}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{wine?.origin ?? " "}</span>
        </Link>
      </div>
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
