"use client";

// 홈·상세가 공유하는 와인잔 "무대". 페이지를 옮기면 잔이 교차 슬라이드로 교체된다.
//
// 구조(핵심):
//   - 프레임(창) = 이 컴포넌트가 레이아웃에 항상 하나만 살아 있어, 페이지를 옮겨도
//     재생성되지 않는다. 홈↔상세에서 위치·크기만 CSS 로 이어진다(창이 움직이는 건
//     홈→상세, 상세→홈 뿐). overflow-hidden 이라 잔은 창 밖으로 삐져나가지 않는다.
//   - 잔 = 창 안에 FluidLab(3D) 캔버스를 "딱 하나"만 두고, 그 캔버스 안에서 잔들이
//     교차 슬라이드한다(lab 에서 검증한 엔진). 페이지를 옮겨도 캔버스는 재초기화되지
//     않고, imperative API(slideOut/addGlass)로 이전 잔을 내보내고 새 잔을 반대편에서
//     들인다. 슬라이드 가속도가 안의 액체를 관성으로 출렁이게 한다.
//   - 캔버스 배경색이 프레임·페이지 배경과 같은 #bda588 이라, 잔이 슬라이드해도 배경
//     사각형은 보이지 않고 "잔"만 미끄러지는 것처럼 보인다.
//
// 전환 순서:
//   - 홈 → 상세: ① 창 이동·축소 → ② 콘텐츠 먼저 fade-in → ③ 잔 교체.
//   - 상세 → 상세: 창 고정, 잔만 교체.
//   - 상세 → 홈: ① 콘텐츠 사라짐 → ② 창을 홈(화면 전체)로 넓힘 → ③ 홈 잔이 화면
//     밖에서 진입.
//
// 재빌드 주의: FluidLab 은 glassType prop 이 바뀌면 씬 전체를 재빌드한다(= 재초기화).
// 그래서 glassType·wineAbsorb·abv props 는 최초 마운트 값으로 "고정"하고, 이후 잔 교체는
// 전부 API 로만 한다. swirlScale 은 재빌드 없이 실시간 반영되므로 live prop 으로 준다.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HOME_GLASS, useGlassOptional } from "./glass-context";

// 글라스 캔버스 배경(3D 씬) → ACES 톤매핑 후 화면엔 #bda588 로 보인다(프레임·페이지와 동일).
const CANVAS_BG = "#9a8168";
const CANVAS_RENDERED = "#bda588";

const FluidLab = dynamic(() => import("@/components/FluidLab"), {
  ssr: false,
  loading: () => null,
});

// 홈에서 이만큼 아무도 잔을 안 만지면 한 번 알아서 스월한다. 눈물자국은 벽이 젖어야
// 생기니, 잔을 만져 볼 생각을 못 한 사람에게 "이거 움직인다"를 한 번 보여 주는 자리다.
// 상세 화면에는 주지 않는다 — 글을 읽는 동안 옆에서 잔이 혼자 움직이면 산만하다.
const HOME_IDLE_SWIRL_S = 7;

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

type Dir = "left" | "right";

// FluidLab 이 onReady 로 넘겨주는 imperative 핸들(한 캔버스 안의 잔 교체).
type LabApi = {
  addGlass: (
    glassType: number,
    absorb?: [number, number, number],
    fromDir?: Dir,
    abv?: number | null
  ) => void;
  slideOut: (dir: Dir) => void;
  getCount: () => number;
};

type GlassSnapshot = { glass: number; absorb: [number, number, number]; abv: number | null };

export function GlassStage() {
  const ctx = useGlassOptional();
  const pathname = usePathname();
  const isHome = pathname === "/";

  // FluidLab 이 최초 마운트 때 props 로 만드는 초기 잔. 이 값(glassType·wineAbsorb)은
  // 이후 절대 바꾸지 않는다(바꾸면 씬이 재빌드돼 "재초기화 없이"가 깨진다). 정상 흐름은
  // 홈에서 시작하므로 HOME_GLASS 로 잡히고, 딥링크로 상세를 바로 열면 첫 useLayoutEffect
  // 에서 API 로 올바른 잔을 들여 보정한다.
  const initialRef = useRef<GlassSnapshot>({
    glass: ctx?.state.glass ?? HOME_GLASS.glass,
    absorb: ctx?.state.absorb ?? HOME_GLASS.absorb,
    abv: ctx?.state.abv ?? HOME_GLASS.abv,
  });

  // 창(프레임)의 홈 여부를 pathname 과 분리해 상태로 든다. 상세→홈에서 창이 바로
  // 홈으로 튀지 않고, 잔 교체가 끝난 뒤 홈 위치로 이동하도록 시점을 늦추기 위함.
  const [frameHome, setFrameHome] = useState(isHome);

  const apiRef = useRef<LabApi | null>(null);
  // API 가 아직 준비되기 전(WebGPU 초기화 중)에 전환이 일어나면 마지막 교체를 여기 담아
  // onReady 에서 흘려보낸다.
  const pendingRef = useRef<{ dir: Dir; snap: GlassSnapshot } | null>(null);
  // 페이지 전환의 잔 교체가 예약돼 있는지. 전환 직후 새 페이지의 GlassSetter 가 색을
  // 넣으면 pathname===last(같은 페이지) 분기가 곧바로 한 번 더 걸린다 — 이때 이 플래그가
  // true 면 건너뛴다(예약된 단일 교체가 그 최신 색을 읽어 처리하므로 이중 교체 방지).
  const navPendingRef = useRef(false);
  // 현재 화면 중앙에 보이는 잔(같은 페이지 색 보정에서 "정말 달라졌는지" 판별용).
  const shownRef = useRef<GlassSnapshot>(initialRef.current);

  const histRef = useRef<string[]>([pathname]);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const glass = ctx?.state.glass;
  const absorb = ctx?.state.absorb;
  const swirlScale = ctx?.state.swirlScale;
  const abv = ctx?.state.abv ?? null;
  const setReveal = ctx?.setRevealContent;

  // 잔 상태를 항상 최신으로 참조한다. 잔 교체(doSwap)는 지연 실행되므로, 그 시점의
  // "가장 최신" 잔을 넣어야 한다(새 페이지의 GlassSetter 가 잔 상태를 넣은 뒤 교체).
  const stateRef = useRef<GlassSnapshot>({
    glass: glass ?? initialRef.current.glass,
    absorb: absorb ?? initialRef.current.absorb,
    abv: abv ?? initialRef.current.abv,
  });
  if (glass != null && absorb != null) {
    stateRef.current = { glass, absorb, abv };
  }

  // 교차 슬라이드: 이전 잔은 dir 쪽으로 내보내고, 새(최신) 잔은 반대편에서 들어온다.
  // API 가 아직 없으면 마지막 교체를 pending 에 담아 onReady 에서 실행한다.
  const doSwap = (dir: Dir) => {
    const snap = stateRef.current;
    shownRef.current = snap;
    const api = apiRef.current;
    if (!api) {
      pendingRef.current = { dir, snap };
      return;
    }
    api.slideOut(dir);
    api.addGlass(snap.glass, snap.absorb, dir === "left" ? "right" : "left", snap.abv);
  };

  // useLayoutEffect: 페인트 전에 실행해, 홈→상세 진입 순간 콘텐츠를 먼저 숨긴다(깜빡 방지).
  // biome-ignore lint/correctness/useExhaustiveDependencies: doSwap 은 ref 만 읽어 안정적
  useLayoutEffect(() => {
    if (glass == null || absorb == null || swirlScale == null) return;
    const hist = histRef.current;
    const last = hist[hist.length - 1];

    // 같은 페이지에서 색·잔만 바뀜(주로 딥링크 첫 진입) → 슬라이드 없이 보정만.
    // 실제로 잔/색이 달라졌을 때만 교체한다(responsive swirlScale 은 live prop 이 처리).
    if (pathname === last) {
      // 방금 페이지를 옮겨 교체가 예약된 상태라면, 그 예약이 새 색을 처리한다 — 건너뛴다.
      if (navPendingRef.current) return;
      const shown = shownRef.current;
      const changed =
        shown.glass !== glass ||
        shown.abv !== abv ||
        shown.absorb[0] !== absorb[0] ||
        shown.absorb[1] !== absorb[1] ||
        shown.absorb[2] !== absorb[2];
      if (changed) doSwap("left");
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
    if (revealTimer.current) clearTimeout(revealTimer.current);

    // 홈 → 상세: ① 창 이동·축소(MOVE_MS) → ② 콘텐츠 먼저 fade-in(REVEAL_MS) → ③ 잔 교체.
    if (wasHome && !isHome) {
      setReveal?.(false);
      setFrameHome(false);
      navPendingRef.current = true;
      moveTimer.current = setTimeout(() => {
        setReveal?.(true);
        revealTimer.current = setTimeout(() => {
          doSwap("left");
          navPendingRef.current = false;
        }, REVEAL_MS);
      }, MOVE_MS);
      return;
    }

    // 상세 → 홈: ① 콘텐츠는 홈 전환으로 이미 사라짐 → ② 창을 홈(화면 전체)으로 넓힌 뒤
    // → ③ 넓어진 창에서 홈 잔이 화면 밖에서 진입.
    if (!wasHome && isHome) {
      setFrameHome(true);
      navPendingRef.current = true;
      moveTimer.current = setTimeout(() => {
        doSwap("right");
        navPendingRef.current = false;
      }, MOVE_MS);
      return;
    }

    // 상세 → 상세: 창 고정, 콘텐츠는 계속 보이고 잔만 교체한다. GlassSetter 가 새 잔을
    // 넣은 뒤(다음 틱) 최신 잔으로 교체하도록 아주 짧게 미룬다(사실상 즉시).
    setReveal?.(true);
    setFrameHome(false);
    navPendingRef.current = true;
    revealTimer.current = setTimeout(() => {
      doSwap(dir);
      navPendingRef.current = false;
    }, 48);
  }, [glass, absorb, abv, swirlScale, isHome, pathname, setReveal]);

  useEffect(() => {
    return () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, []);

  if (!ctx) return null;

  return (
    <div
      data-testid="glass-stage"
      className={`pointer-events-none absolute z-10 overflow-hidden transition-all ease-in-out ${frameClass(frameHome)}`}
      style={{ background: CANVAS_RENDERED, transitionDuration: `${MOVE_MS}ms` }}
    >
      <FluidLab
        wineAbsorb={initialRef.current.absorb}
        abv={initialRef.current.abv}
        glassType={initialRef.current.glass}
        bgColor={CANVAS_BG}
        swirlScale={swirlScale ?? HOME_GLASS.swirlScale}
        idleSwirlAfter={isHome ? HOME_IDLE_SWIRL_S : undefined}
        backingToViewport
        onReady={(api) => {
          apiRef.current = api;
          const p = pendingRef.current;
          if (p) {
            pendingRef.current = null;
            api.slideOut(p.dir);
            api.addGlass(
              p.snap.glass,
              p.snap.absorb,
              p.dir === "left" ? "right" : "left",
              p.snap.abv
            );
          }
        }}
      />
    </div>
  );
}
