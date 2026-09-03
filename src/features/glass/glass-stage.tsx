"use client";

// 홈·상세가 공유하는 와인잔 "무대". 페이지를 옮기면 잔이 슬라이드로 교체된다.
//
// 구조(핵심):
//   - 프레임(창) = 이 컴포넌트가 레이아웃에 항상 하나만 살아 있어, 페이지를 옮겨도
//     재생성되지 않는다. 홈↔상세에서 위치·크기만 CSS 로 이어진다(창이 움직이는 건
//     홈→상세, 상세→홈 뿐). overflow-hidden 이라 잔은 창 밖으로 삐져나가지 않는다.
//   - 잔 = 창 "안에서만" 슬라이드한다. 각 잔은 FluidLab(3D) 캔버스인데, 캔버스가 화면에
//     그리는 배경색이 프레임·페이지 배경과 같은 #bda588 이라, 캔버스가 슬라이드해도
//     배경 사각형은 보이지 않고 "잔"만 미끄러지는 것처럼 보인다.
//
// 전환 순서:
//   - 홈 → 상세: ① 창 이동·축소 → ② 콘텐츠 먼저 fade-in → ③ 잔 교체.
//   - 상세 → 상세: 창 고정, 잔만 교체.
//   - 상세 → 홈: ① 콘텐츠 사라짐 → ② 창을 홈(화면 전체)로 넓힘 → ③ 홈 잔이 화면
//     밖에서 진입.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGlassOptional } from "./glass-context";

// 글라스 캔버스 배경(3D 씬) → ACES 톤매핑 후 화면엔 #bda588 로 보인다(프레임·페이지와 동일).
const CANVAS_BG = "#9a8168";
const CANVAS_RENDERED = "#bda588";

const FluidLab = dynamic(() => import("@/components/FluidLab"), {
  ssr: false,
  loading: () => null,
});

const SLIDE_MS = 700; // 잔 슬라이드 인/아웃
const MOVE_MS = 700; // 홈→상세에서 창이 이동·축소하는 시간
const REVEAL_MS = 500; // 콘텐츠 fade-in 시간(WineDetailView 의 duration-500 과 맞춤)

// 창(프레임)의 위치·크기: 홈은 화면 좌우로 넓게(잔이 넓은 공간을 미끄러져 화면 끝에서
// 자연스럽게 들어오고 나가도록), 상세는 왼쪽 칸/상단(모바일).
//
// 주의: CSS transition 은 right/bottom/inset 의 auto 전환을 애니메이션하지 못한다.
// 창이 부드럽게 이동·축소되도록 left·top·width·height 를 모두 명시적 길이로만 잡는다.
function frameClass(isHome: boolean) {
  return isHome
    ? "left-0 top-[6vh] h-[76vh] w-full"
    : "left-4 top-20 h-72 w-[calc(100%-2rem)] md:left-6 md:top-16 md:h-[calc(100vh-5.5rem)] md:w-[19%] md:min-w-[180px]";
}

type Pane = {
  key: number;
  glass: number;
  absorb: [number, number, number];
  swirlScale: number;
};

type Dir = "left" | "right";

// 잔 한 겹: 창 안에서 translateX 로 미끄러진다(창 밖은 overflow-hidden 으로 잘린다).
// 캔버스 배경이 페이지색과 같아, 슬라이드해도 잔만 움직이는 것처럼 보인다.
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
      className="absolute inset-0 ease-in-out"
      style={{
        transform: `translateX(${tx})`,
        transitionProperty: "transform",
        transitionDuration: `${SLIDE_MS}ms`,
      }}
    >
      <FluidLab
        wineAbsorb={pane.absorb}
        glassType={pane.glass}
        bgColor={CANVAS_BG}
        swirlScale={pane.swirlScale}
      />
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
    swirlScale: ctx?.state.swirlScale ?? 0.8,
  }));
  const [exiting, setExiting] = useState<(Pane & { dir: Dir }) | null>(null);
  const [enterDir, setEnterDir] = useState<Dir | null>(null);
  // 창(프레임)의 홈 여부를 pathname 과 분리해 상태로 든다. 상세→홈에서 창이 바로
  // 홈으로 튀지 않고, 잔 교체가 끝난 뒤 홈 위치로 이동하도록 시점을 늦추기 위함.
  const [frameHome, setFrameHome] = useState(isHome);

  const curRef = useRef(current);
  curRef.current = current;
  const keyRef = useRef(0);
  const histRef = useRef<string[]>([pathname]);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const glass = ctx?.state.glass;
  const absorb = ctx?.state.absorb;
  const swirlScale = ctx?.state.swirlScale;
  const setReveal = ctx?.setRevealContent;

  // 잔 상태를 항상 최신으로 참조한다. 잔 교체(startSwap)는 지연 실행되므로, 그 시점의
  // "가장 최신" 잔을 넣어야 한다(새 페이지의 GlassSetter 가 잔 상태를 넣은 뒤 교체).
  const stateRef = useRef({
    glass: glass ?? 1,
    absorb: absorb ?? ([16, 78, 98] as [number, number, number]),
    swirlScale: swirlScale ?? 0.8,
  });
  if (glass != null && absorb != null && swirlScale != null) {
    stateRef.current = { glass, absorb, swirlScale };
  }

  // useLayoutEffect: 페인트 전에 실행해, 홈→상세 진입 순간 콘텐츠를 먼저 숨긴다(깜빡 방지).
  useLayoutEffect(() => {
    if (glass == null || absorb == null || swirlScale == null) return;
    const cur = curRef.current;
    const hist = histRef.current;
    const last = hist[hist.length - 1];

    // 같은 페이지에서 색·잔만 바뀜 → 슬라이드 없이 갱신.
    if (pathname === last) {
      setCurrent({ ...cur, glass, absorb, swirlScale });
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
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (frameTimer.current) clearTimeout(frameTimer.current);

    // 잔을 교체(이전 잔은 swapDir 쪽으로 나가고, 새 잔은 반대편에서 들어온다).
    // 새로 들어오는 잔은 stateRef 의 최신값을 쓴다(지연 실행 시점의 실제 잔).
    const startSwap = (from: Pane, swapDir: Dir) => {
      const s = stateRef.current;
      keyRef.current += 1;
      setExiting({ ...from, dir: swapDir });
      setCurrent({
        key: keyRef.current,
        glass: s.glass,
        absorb: s.absorb,
        swirlScale: s.swirlScale,
      });
      setEnterDir(swapDir);
      exitTimer.current = setTimeout(() => {
        setExiting(null);
        setEnterDir(null);
      }, SLIDE_MS);
    };

    // 홈 → 상세: ① 창 이동·축소(MOVE_MS) → ② 콘텐츠 먼저 fade-in(REVEAL_MS) → ③ 잔 교체.
    if (wasHome && !isHome) {
      setReveal?.(false);
      setFrameHome(false);
      moveTimer.current = setTimeout(() => {
        setReveal?.(true);
        revealTimer.current = setTimeout(() => {
          startSwap(curRef.current, "left");
        }, REVEAL_MS);
      }, MOVE_MS);
      return;
    }

    // 상세 → 홈: ① 콘텐츠는 홈 전환으로 이미 사라짐 → ② 창을 홈(화면 전체)으로 넓힌 뒤
    // → ③ 넓어진 창에서 홈 잔이 화면 밖에서 진입.
    if (!wasHome && isHome) {
      setFrameHome(true);
      moveTimer.current = setTimeout(() => {
        startSwap(cur, "right");
      }, MOVE_MS);
      return;
    }

    // 상세 → 상세: 창 고정, 콘텐츠는 계속 보이고 잔만 교체한다. GlassSetter 가 새 잔을
    // 넣은 뒤(다음 틱) 최신 잔으로 교체하도록 아주 짧게 미룬다(사실상 즉시).
    setReveal?.(true);
    setFrameHome(false);
    revealTimer.current = setTimeout(() => startSwap(cur, dir), 48);
  }, [glass, absorb, swirlScale, isHome, pathname, setReveal]);

  useEffect(() => {
    return () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (revealTimer.current) clearTimeout(revealTimer.current);
      if (frameTimer.current) clearTimeout(frameTimer.current);
    };
  }, []);

  if (!ctx) return null;

  return (
    <div
      className={`pointer-events-none absolute z-10 overflow-hidden transition-all ease-in-out ${frameClass(frameHome)}`}
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
