"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { glassFor, useGlassOptional } from "@/features/glass/glass-context";
import {
  isToastTurn,
  NAME_DELAY_S,
  NAME_LEAD_S,
  RESUME_AFTER_TOUCH_S,
  rotationOrder,
  TOAST_DELAY_S,
  TOAST_EXIT_S,
  TOAST_NAME_DELAY_S,
  WINE_HOLD_S,
} from "@/features/glass/rotation";
import { type Toast, toastFor } from "@/features/glass/toast";
import type { RotationWine } from "@/features/wine/db/queries";

// 홈 랜딩: 검색바·헤더·와인잔·배경은 (main) 레이아웃이 제공한다. 여기선 리듬을 돌리고
// (순환), 잔 아래 이름을 얹고, 푸터를 둔다.
//
// **처음엔 기본 잔이다 — 이름도 없다.** 42초가 지나야 첫 순환 와인으로 바뀌면서 이름이
// 따라 들어온다. 들어가자마자 바뀌면 "왜 벌써 바뀌지" 싶고, 리듬도 첫 잔만 어긋난다.
//
// 잔을 직접 바꾸지 않는다 — 잔 상태(setGlass)만 갈아 끼우면 GlassStage 가 "같은
// 페이지에서 잔이 달라졌다"를 보고 교차 슬라이드로 바꿔 준다. 리듬 상수는 rotation.ts.
//
// 네 번에 한 번은 이름이 오기 전 틈에 그 나라 말 건배말이 들렀다 간다(toast.ts).
// 이름과 같은 자리를 쓰므로 화면이 움직이는 횟수는 그대로다.

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
  const rotation = ctx?.rotation;
  const swapSeq = ctx?.swapSeq ?? 0;
  const reduced = useReducedMotion();

  const [wine, setWine] = useState<RotationWine | null>(null);
  const [phase, setPhase] = useState<NamePhase>("enter");
  // 이번 교체에 끼워 넣을 건배말. null 이면 이름이 평소대로 일찍 들어온다.
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastPhase, setToastPhase] = useState<NamePhase>("enter");
  const year = new Date().getFullYear();

  // biome-ignore lint/correctness/useExhaustiveDependencies: 리듬은 마운트 때 한 번만 짠다
  useEffect(() => {
    if (!setGlass || !rotation || wines.length === 0) return;
    // 순서는 셸에 둔다 — 상세를 다녀와도 다시 섞이지 않고 그 자리에서 이어진다.
    // i = -1 은 아직 기본 잔(이름 없음)이라는 뜻이다.
    if (!rotation.current) rotation.current = { order: rotationOrder(wines), i: -1 };
    const rot = rotation.current;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const wait = (ms: number, fn: () => void) => {
      timer = setTimeout(fn, ms);
    };

    const show = (w: RotationWine) => {
      setWine(w);
      setPhase("enter"); // 오른쪽 바깥에 갖다 놓는다. 등장 시점은 아래 효과가 잡는다.
      setGlass(glassFor(w));
    };

    // 이미 순환이 시작됐다면(상세를 다녀온 경우) 보던 와인으로 돌아간다.
    // 아직이면 아무것도 하지 않는다 — 기본 잔이 이름 없이 떠 있는 상태 그대로.
    if (rot.i >= 0) show(rot.order[rot.i]);
    // 움직임을 줄이려는 사용자에겐 바꾸지 않는다.
    if (!reduced && rot.order.length > 0) scheduleNext();

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
      setPhase("exit"); // 이름이 먼저 왼쪽으로 빠지고(첫 번째는 이름이 없어 티가 안 난다)
      wait(NAME_LEAD_S * 1000, () => {
        rot.i = (rot.i + 1) % rot.order.length;
        const next = rot.order[rot.i];
        // 건배말은 이름이 비운 자리에 잠깐 들어갔다 나온다. 나라를 모르는 와인이면
        // 그냥 건너뛴다 — 모르면 말하지 않는다.
        setToast(isToastTurn(rot.i) ? toastFor(next.country) : null);
        setToastPhase("enter");
        show(next); // 잔이 뒤따라 바뀐다
        scheduleNext();
      });
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [setGlass, rotation, wines, reduced]);

  // 이름은 **잔이 실제로 미끄러지기 시작한 뒤** 얹는다.
  //
  // 잔 상태를 바꾼 시각과 잔이 움직이기 시작하는 시각이 늘 같지는 않다 — 첫 교체는
  // FluidLab 초기화(WebGPU)를 기다렸다가 움직인다. 상태 변경을 기준으로 세면 그 첫
  // 번째만 이름이 먼저 떠 잔과 따로 놀았다. swapSeq 는 잔이 밀려나는 순간에 오른다.
  //
  // wine 도 함께 보는 건 안전판이다 — 잔이 끝내 안 움직이는 경우(색·잔이 같아 교체가
  // 생략되는 등)에도 이름은 떠야 한다.
  //
  // 건배말이 있는 회차는 이 자리를 건배말이 먼저 쓴다 — 들어왔다 나간 뒤에 이름이
  // 온다. 그래서 타이머가 셋이고 이름은 늦다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: swapSeq 는 읽는 값이 아니라 "잔이 밀리기 시작했다"는 신호다. 그때 타이머를 다시 잡으려고 일부러 넣는다.
  useEffect(() => {
    if (!wine) return;
    if (!toast) {
      const t = setTimeout(() => setPhase("shown"), NAME_DELAY_S * 1000);
      return () => clearTimeout(t);
    }
    const timers = [
      setTimeout(() => setToastPhase("shown"), TOAST_DELAY_S * 1000),
      setTimeout(() => setToastPhase("exit"), TOAST_EXIT_S * 1000),
      setTimeout(() => setPhase("shown"), TOAST_NAME_DELAY_S * 1000),
    ];
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [wine, toast, swapSeq]);

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
        {/* 건배말은 이름과 **같은 자리**에 겹쳐 둔다(흐름 밖으로 빼서 절대 위치).
            위아래로 나란히 두면 건배말이 뜨는 회차만 이름이 아래로 밀려 내려간다. */}
        {toast && (
          <p
            data-testid="home-toast"
            className={`absolute inset-x-0 top-0 px-4 py-2 text-center transition-all ease-out ${NAME_CLASS[toastPhase]}`}
            style={{ transitionDuration: `${NAME_MOVE_MS}ms` }}
          >
            <span
              lang={toast.lang}
              dir={toast.rtl ? "rtl" : undefined}
              className="block font-toast text-lg text-foreground md:text-xl"
            >
              {toast.text}
            </span>
            <span className="mt-0.5 block text-xs text-muted">{toast.countryKo}</span>
          </p>
        )}
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
