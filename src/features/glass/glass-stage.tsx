"use client";

// 홈·상세가 공유하는 와인잔 "무대". 잔 종류(glass)가 바뀔 때는 두 개의 라이브 잔이
// 교차 슬라이드한다(나가는 잔은 방향쪽으로 빠지며 액체가 출렁이고, 들어오는 잔은
// 반대편에서 들어온다). 같은 잔 종류면 슬라이드 없이 색·위치만 부드럽게 전환한다.
//   - 앞으로 가기(새 페이지) = 왼쪽으로 슬라이드
//   - 뒤로 가기(방문했던 페이지) = 오른쪽으로 슬라이드
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGlassOptional } from "./glass-context";

// 글라스 캔버스 배경(3D 씬) → ACES 톤매핑 후 화면엔 #bda588 로 보인다.
const CANVAS_BG = "#9a8168";

const FluidLab = dynamic(() => import("@/components/FluidLab"), {
  ssr: false,
  loading: () => null,
});

const SLIDE_MS = 700;

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

// 슬라이드 한 겹: 바깥(무대)이 translateX 로 밀리고, 안쪽이 잔의 실제 위치를 잡는다.
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
    dir === "left" ? (mode === "exit" ? "-110%" : "110%") : mode === "exit" ? "110%" : "-110%";
  const tx = atRest ? "0%" : off;
  const opacity = mode === "active" ? 1 : atRest ? 1 : 0;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 ease-in-out"
      style={{
        transform: `translateX(${tx})`,
        opacity,
        transitionProperty: "transform, opacity",
        transitionDuration: `${SLIDE_MS}ms`,
      }}
    >
      <div
        className={`pointer-events-auto absolute transition-all duration-700 ease-in-out ${posClass(layer.isHome)}`}
      >
        <FluidLab
          wineAbsorb={layer.absorb}
          glassType={layer.glass}
          bgColor={CANVAS_BG}
          swirlScale={layer.swirlScale}
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
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const absorb = ctx?.state.absorb;
  const glass = ctx?.state.glass;
  const swirlScale = ctx?.state.swirlScale;

  useEffect(() => {
    if (glass == null || absorb == null || swirlScale == null) return;
    const cur = curRef.current;

    // 같은 잔 종류: 슬라이드 없이 색·위치만 갱신(같은 인스턴스 유지 → 가장 가볍다).
    if (cur.glass === glass) {
      setCurrent({ ...cur, absorb, swirlScale, isHome });
      return;
    }

    // 다른 잔 종류: 방향을 정해 두 잔을 교차 슬라이드.
    const hist = histRef.current;
    let dir: Dir = "left"; // 앞으로 가기 = 왼쪽
    if (hist.length >= 2 && hist[hist.length - 2] === pathname) {
      dir = "right"; // 방문했던 곳으로 뒤로 가기 = 오른쪽
      hist.pop();
    } else {
      hist.push(pathname);
    }

    keyRef.current += 1;
    setExiting({ ...cur, dir });
    setCurrent({ key: keyRef.current, absorb, glass, swirlScale, isHome });
    setEnterDir(dir);

    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      setExiting(null);
      setEnterDir(null);
    }, SLIDE_MS);
  }, [glass, absorb, swirlScale, isHome, pathname]);

  useEffect(() => {
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  if (!ctx) return null;

  return (
    <>
      {exiting ? (
        <SlideLayer key={`exit-${exiting.key}`} layer={exiting} mode="exit" dir={exiting.dir} />
      ) : null}
      <SlideLayer
        key={`cur-${current.key}`}
        layer={current}
        mode={enterDir ? "enter" : "active"}
        dir={enterDir ?? "left"}
      />
    </>
  );
}
