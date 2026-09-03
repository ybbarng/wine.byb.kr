"use client";

// 홈·상세가 공유하는 와인잔 "무대". 페이지를 옮기면 잔이 슬라이드로 교체된다.
// 캔버스 배경은 투명(FluidLab transparent)이라 슬라이드해도 배경 사각형 없이
// "잔"만 미끄러져 보인다. 페이지 배경은 레이아웃이 고정으로 깔아 안 움직인다.
//   - 홈 → 상세: 잔 영역이 먼저 왼쪽으로 이동+축소된 뒤, 홈 잔이 왼쪽으로
//     슬라이드아웃하고 그 자리에 해당 와인 잔이 슬라이드인(2단계).
//   - 상세 → 상세: 현재 잔이 슬라이드아웃하고 새 잔이 슬라이드인.
//   - 뒤로 가기: 현재 잔이 오른쪽으로 나가고 새 잔이 왼쪽에서 들어온다.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGlassOptional } from "./glass-context";

const FluidLab = dynamic(() => import("@/components/FluidLab"), {
  ssr: false,
  loading: () => null,
});

const SLIDE_MS = 700; // 잔 슬라이드 인/아웃 시간
const MOVE_MS = 700; // 홈→상세에서 잔 영역이 왼쪽으로 이동+축소하는 시간

// 잔의 위치·크기: 홈은 화면 중앙 크게, 상세는 왼쪽 칸(데스크톱 19%)/상단(모바일).
function posClass(isHome: boolean) {
  return isHome
    ? "left-1/2 top-[6vh] h-[76vh] w-[68vh] max-w-full -translate-x-1/2"
    : "left-4 right-4 top-20 h-72 md:left-6 md:right-auto md:top-16 md:bottom-6 md:h-auto md:w-[19%] md:min-w-[180px]";
}

type Layer = {
  key: number;
  absorb: [number, number, number];
  glass: number;
  swirlScale: number;
  isHome: boolean;
};

type Dir = "left" | "right";

// 슬라이드 한 겹: 바깥(무대)이 translateX 로 잔을 화면 안/밖으로 밀고, 안쪽이 잔의
// 실제 위치를 잡는다. 캔버스가 투명이라 잔만 미끄러진다.
function SlideLayer({
  layer,
  mode,
  dir,
}: {
  layer: Layer;
  mode: "enter" | "exit" | "active";
  dir: Dir;
}) {
  // atRest = 잔이 제자리(translateX 0)인가. enter 는 화면 밖에서 시작해 제자리로,
  // exit 는 제자리에서 화면 밖으로 나간다. active 는 항상 제자리.
  const [atRest, setAtRest] = useState(mode !== "enter");

  useEffect(() => {
    if (mode === "enter") {
      // 다음 프레임에 제자리로(초기 off-screen 렌더가 화면에 반영된 뒤 전환 시작).
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setAtRest(true)));
      return () => cancelAnimationFrame(id);
    }
    if (mode === "exit") {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setAtRest(false)));
      return () => cancelAnimationFrame(id);
    }
  }, [mode]);

  // 화면 밖 위치: 나갈 땐 dir 쪽으로, 들어올 땐 dir 반대편에서.
  const off =
    dir === "left" ? (mode === "exit" ? "-115%" : "115%") : mode === "exit" ? "115%" : "-115%";
  const tx = atRest ? "0%" : off;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 ease-in-out"
      style={{
        transform: `translateX(${tx})`,
        transitionProperty: "transform",
        transitionDuration: `${SLIDE_MS}ms`,
      }}
    >
      <div
        className={`pointer-events-auto absolute transition-all ease-in-out ${posClass(layer.isHome)}`}
        style={{ transitionDuration: `${MOVE_MS}ms` }}
      >
        <FluidLab
          wineAbsorb={layer.absorb}
          glassType={layer.glass}
          swirlScale={layer.swirlScale}
          transparent
        />
      </div>
    </div>
  );
}

export function GlassStage() {
  const ctx = useGlassOptional();
  const pathname = usePathname();
  const isHome = pathname === "/";

  const [current, setCurrent] = useState<Layer>(() => ({
    key: 0,
    absorb: ctx?.state.absorb ?? [16, 78, 98],
    glass: ctx?.state.glass ?? 1,
    swirlScale: ctx?.state.swirlScale ?? 0.8,
    isHome,
  }));
  const [exiting, setExiting] = useState<(Layer & { dir: Dir }) | null>(null);
  const [enterDir, setEnterDir] = useState<Dir | null>(null);

  const curRef = useRef(current);
  curRef.current = current;
  const keyRef = useRef(0);
  const histRef = useRef<string[]>([pathname]);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const absorb = ctx?.state.absorb;
  const glass = ctx?.state.glass;
  const swirlScale = ctx?.state.swirlScale;

  useEffect(() => {
    if (glass == null || absorb == null || swirlScale == null) return;
    const cur = curRef.current;
    const hist = histRef.current;
    const last = hist[hist.length - 1];

    // 같은 페이지에서 색·잔만 바뀜 → 슬라이드 없이 갱신.
    if (pathname === last) {
      setCurrent({ ...cur, absorb, glass, swirlScale, isHome });
      return;
    }

    // 방향: 방문했던 곳으로 되돌아가면 뒤로(오른쪽), 아니면 앞으로(왼쪽).
    let dir: Dir = "left";
    if (hist.length >= 2 && hist[hist.length - 2] === pathname) {
      dir = "right";
      hist.pop();
    } else {
      hist.push(pathname);
    }

    // 이전 전환 타이머 정리(빠른 연속 이동 대비).
    if (moveTimer.current) clearTimeout(moveTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);

    // 슬라이드 교체를 시작한다(이전 잔은 dir 쪽으로, 새 잔은 반대편에서).
    const startSwap = (from: Layer, swapDir: Dir) => {
      keyRef.current += 1;
      setExiting({ ...from, dir: swapDir });
      setCurrent({ key: keyRef.current, absorb, glass, swirlScale, isHome });
      setEnterDir(swapDir);
      exitTimer.current = setTimeout(() => {
        setExiting(null);
        setEnterDir(null);
      }, SLIDE_MS);
    };

    // 홈 → 상세: 먼저 잔 영역을 왼쪽으로 이동+축소(같은 잔), 완료 후 슬라이드 교체.
    if (cur.isHome && !isHome) {
      setCurrent({ ...cur, isHome: false });
      moveTimer.current = setTimeout(() => {
        startSwap(curRef.current, "left");
      }, MOVE_MS);
      return;
    }

    // 그 외: 바로 슬라이드 교체.
    startSwap(cur, dir);
  }, [glass, absorb, swirlScale, isHome, pathname]);

  useEffect(() => {
    return () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  if (!ctx) return null;

  return (
    <>
      {exiting ? (
        <SlideLayer key={exiting.key} layer={exiting} mode="exit" dir={exiting.dir} />
      ) : null}
      <SlideLayer
        key={current.key}
        layer={current}
        mode={enterDir ? "enter" : "active"}
        dir={enterDir ?? "left"}
      />
    </>
  );
}
