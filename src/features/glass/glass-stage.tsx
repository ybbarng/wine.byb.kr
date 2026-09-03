"use client";

// 홈·상세가 공유하는 와인잔 "무대" — 지금은 3D 를 얹기 전 단색 사각형 뼈대다.
//
// 구조(핵심):
//   - 프레임(창) = 이 컴포넌트가 레이아웃에 항상 하나만 살아 있어, 페이지를 옮겨도
//     재생성되지 않는다. 홈↔상세에서 위치·크기만 CSS 로 이어진다(창이 움직이는 건
//     이때뿐이다). overflow-hidden 이라 잔은 창 밖으로 삐져나가지 않는다.
//   - 잔 = 창 "안에서만" 슬라이드한다. 창(3D 세계를 보는 구멍)은 고정, 그 안의 잔만
//     옆으로 흐른다. 상세→상세는 창 고정 + 잔 교체, 홈→상세는 창이 먼저 왼쪽으로
//     이동·축소한 뒤 잔을 교체한다. 뒤로 가기는 반대 방향.
//
// 3D(FluidLab)로 바꿀 때는 이 단색 블록 자리에 잔을 넣고, 슬라이드는 CSS 대신 3D
// 좌표 이동으로 옮긴다(나간 잔은 제거, 전환 후 좌표 재정규화).
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGlassOptional } from "./glass-context";

// 글라스 캔버스 렌더색(3D 배경이 화면에 보이는 색)과 맞춘 프레임 배경.
const CANVAS_RENDERED = "#bda588";
const SLIDE_MS = 700; // 잔 슬라이드 인/아웃
const MOVE_MS = 700; // 홈→상세에서 창이 이동·축소하는 시간

// 창(프레임)의 위치·크기: 홈은 화면 좌우로 넓게(잔이 넓은 공간을 미끄러져 화면 끝에서
// 자연스럽게 사라지도록), 상세는 왼쪽 칸/상단(모바일). 잔 자체 크기는 창 높이에 맞춰
// 고정 비율이라 창 폭이 넓어도 커지지 않고 중앙에 놓인다.
function frameClass(isHome: boolean) {
  return isHome
    ? "inset-x-0 top-[6vh] h-[76vh]"
    : "left-4 right-4 top-20 h-72 md:left-6 md:right-auto md:top-16 md:bottom-6 md:h-auto md:w-[19%] md:min-w-[180px]";
}

type Pane = { key: number; glass: number; absorb: [number, number, number] };
type Dir = "left" | "right";

// 프로토타입 잔 색: 와인 흡수계수(absorb)로 대략의 와인색을 흉내낸다(3D 전 임시).
function paneColor(absorb: [number, number, number]) {
  const [r, g, b] = absorb;
  const cr = Math.round(Math.max(30, 235 - r * 1.7));
  const cg = Math.round(Math.max(18, 210 - g * 1.7));
  const cb = Math.round(Math.max(18, 210 - b * 1.7));
  return `rgb(${cr} ${cg} ${cb})`;
}

// 잔 한 겹: 창 안에서 translateX 로 미끄러진다(창 밖은 overflow-hidden 으로 잘린다).
function GlassPane({
  pane,
  mode,
  dir,
}: {
  pane: Pane;
  mode: "enter" | "exit" | "active";
  dir: Dir;
}) {
  const [atRest, setAtRest] = useState(mode !== "enter");

  useEffect(() => {
    if (mode === "enter") {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setAtRest(true)));
      return () => cancelAnimationFrame(id);
    }
    if (mode === "exit") {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setAtRest(false)));
      return () => cancelAnimationFrame(id);
    }
  }, [mode]);

  // 창 폭 기준으로 나가고(dir 쪽) 들어온다(반대편). 120% 면 창 밖으로 완전히 벗어난다.
  const off =
    dir === "left" ? (mode === "exit" ? "-120%" : "120%") : mode === "exit" ? "120%" : "-120%";
  const tx = atRest ? "0%" : off;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center ease-in-out"
      style={{
        transform: `translateX(${tx})`,
        transitionProperty: "transform",
        transitionDuration: `${SLIDE_MS}ms`,
      }}
    >
      {/* 프로토타입 잔(3D FluidLab 자리): 단색 블록 + 잔 종류 번호. 창 높이에 맞춘
          고정 비율(aspect)이라 창 폭이 넓어도 커지지 않고 중앙에 놓인다. */}
      <div
        className="flex aspect-[3/5] h-4/5 max-w-[90%] flex-col items-center justify-center rounded-[45%] text-white shadow-xl"
        style={{ background: paneColor(pane.absorb) }}
      >
        <span className="text-sm font-medium opacity-90">잔 #{pane.glass}</span>
      </div>
    </div>
  );
}

export function GlassStage() {
  const ctx = useGlassOptional();
  const pathname = usePathname();
  const isHome = pathname === "/";

  const [current, setCurrent] = useState<Pane>(() => ({
    key: 0,
    glass: ctx?.state.glass ?? 1,
    absorb: ctx?.state.absorb ?? [16, 78, 98],
  }));
  const [exiting, setExiting] = useState<(Pane & { dir: Dir }) | null>(null);
  const [enterDir, setEnterDir] = useState<Dir | null>(null);

  const curRef = useRef(current);
  curRef.current = current;
  const keyRef = useRef(0);
  const histRef = useRef<string[]>([pathname]);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const glass = ctx?.state.glass;
  const absorb = ctx?.state.absorb;
  const setReveal = ctx?.setRevealContent;

  useEffect(() => {
    if (glass == null || absorb == null) return;
    const cur = curRef.current;
    const hist = histRef.current;
    const last = hist[hist.length - 1];

    // 같은 페이지에서 색·잔만 바뀜 → 슬라이드 없이 갱신.
    if (pathname === last) {
      setCurrent({ ...cur, glass, absorb });
      return;
    }

    const wasHome = last === "/";

    // 방향: 방문했던 곳으로 되돌아가면 뒤로(오른쪽), 아니면 앞으로(왼쪽).
    let dir: Dir = "left";
    if (hist.length >= 2 && hist[hist.length - 2] === pathname) {
      dir = "right";
      hist.pop();
    } else {
      hist.push(pathname);
    }

    if (moveTimer.current) clearTimeout(moveTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);

    // 잔을 교체(이전 잔은 swapDir 쪽으로 나가고, 새 잔은 반대편에서 들어온다).
    const startSwap = (from: Pane, swapDir: Dir) => {
      keyRef.current += 1;
      setExiting({ ...from, dir: swapDir });
      setCurrent({ key: keyRef.current, glass, absorb });
      setEnterDir(swapDir);
      exitTimer.current = setTimeout(() => {
        setExiting(null);
        setEnterDir(null);
      }, SLIDE_MS);
    };

    // 홈 → 상세: 창이 먼저 왼쪽으로 이동·축소(frameClass 가 isHome=false 로 전환)하는
    // 동안 상세 콘텐츠를 숨겨(겹침 방지) 두었다가, 이동이 끝나면 잔을 교체하고 콘텐츠를
    // fade-in 한다.
    if (wasHome && !isHome) {
      setReveal?.(false);
      moveTimer.current = setTimeout(() => {
        startSwap(curRef.current, "left");
        setReveal?.(true);
      }, MOVE_MS);
      return;
    }

    // 상세 → 상세(및 뒤로 가기): 창 고정, 콘텐츠는 계속 보이고, 바로 잔 교체.
    setReveal?.(true);
    startSwap(cur, dir);
  }, [glass, absorb, isHome, pathname, setReveal]);

  useEffect(() => {
    return () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  if (!ctx) return null;

  return (
    <div
      className={`pointer-events-none absolute z-10 overflow-hidden rounded-2xl transition-all ease-in-out ${frameClass(isHome)}`}
      style={{ background: CANVAS_RENDERED, transitionDuration: `${MOVE_MS}ms` }}
    >
      {exiting ? (
        <GlassPane key={exiting.key} pane={exiting} mode="exit" dir={exiting.dir} />
      ) : null}
      <GlassPane
        key={current.key}
        pane={current}
        mode={enterDir ? "enter" : "active"}
        dir={enterDir ?? "left"}
      />
    </div>
  );
}
