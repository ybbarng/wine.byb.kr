"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { adminHeaders, useAuthStore } from "@/features/admin/auth-store";
import { ALL_PALETTE_AROMAS, AROMA_PALETTE } from "@/features/wine/aroma-palette";
import {
  abvNote,
  agingColorNote,
  agingFlavorNote,
  climateAromaNote,
  climateFlavorNote,
  expectedAromaGroups,
  expectedColorHint,
  expectedFlavorFor,
  expectedLegsNote,
  FLAVOR_AXES,
  oakNone,
  sweetnessBreadthNote,
  wineAgeYears,
} from "@/features/wine/tasting-hints";
import { WineColorPicker } from "@/features/wine/wine-color-picker";
import { defaultColorHex, wineGlassFor } from "@/features/wine/wine-glass";
import { winemakingFlavorNote } from "@/features/wine/winemaking";
import { wineDisplayName } from "@/lib/wine";
import {
  type FlavorFelt,
  type TastingNoteFormInput,
  type TastingNoteInput,
  tastingNoteSchema,
} from "./tasting-note-schema";
import { type ExistingNote, toDefaults, type WineOption } from "./tasting-note-types";

const FluidLab = dynamic(() => import("@/components/FluidLab"), {
  ssr: false,
  loading: () => null,
});

// 글라스 캔버스 배경 — 와인 페이지(WineDetailView)와 같은 평평한 웜톤으로 통일해,
// 프리뷰에서 고른 색이 실제 와인 페이지 잔과 같게 보이게 한다. (bgColor 를 안 주면
// 흐린 HDR 이 뒤에 비쳐 뿌옇고 위쪽이 어둡다.) 색 정확도는 hexToAbsorb 로그 보정으로.
const CANVAS_BG = "#9a8168";
const CANVAS_RENDERED = "#bda588";

const REPURCHASE_OPTS = ["응", "아마", "아니"] as const;
// 가격 대비 5단계(기존 3단계를 포함). 왼→오: 좋음 → 아쉬움.
const VALUE_OPTS = ["아주 만족", "만족", "보통", "아쉬움", "매우 아쉬움"] as const;

// 실제 시음 순서를 따른다: 고르고 → (병·영수증으로 미리 아는) 빈티지·구매 정보 →
// 붓고 색 보고 → 코로 향 맡고 → 한 모금 머금어 맛 보고 → 한마디 메모 →
// 다 맛본 뒤 종합 별점 → 값어치·재구매.
// (별점은 마셔봐야 매길 수 있어 뒤쪽, 빈티지·구매는 미리 아는 정보라 앞쪽에 둔다.)
const STEPS = [
  { key: "wine", title: "어떤 와인이에요?", sub: "기록할 와인을 골라요" },
  { key: "buy", title: "빈티지·구매 정보", sub: "병·영수증으로 미리 아는 것 — 없으면 건너뛰어요" },
  { key: "color", title: "잔을 살펴볼까요?", sub: "색을 맞추고, 돌려서 벽을 봐요" },
  { key: "aroma", title: "어떤 향이 났어요?", sub: "코를 대고 맡은 향을 골라요" },
  { key: "flavor", title: "맛은 어땠어요?", sub: "한 모금 머금고 느낀 만큼 표시해요" },
  { key: "note", title: "한마디 남길까요?", sub: "인상·함께한 음식을 자유롭게" },
  { key: "rating", title: "몇 점이었어요?", sub: "다 맛보고 전체 인상을 별로" },
  { key: "verdict", title: "값어치는 어땠어요?", sub: "구매가를 보며 가격 대비·재구매를" },
] as const;

const inputClass =
  "w-full rounded-xl border border-foreground/20 bg-card/60 px-3 py-3 text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-gold/50";

/**
 * 예상 안내를 "답한 뒤"에 여는 껍데기. 답하기 전에는 무엇을 할 차례인지만 보여주고,
 * 그래도 보고 싶으면 눌러서 열 수 있다(가이드는 강제가 아니라 곁들임).
 */
function Reveal({
  open,
  onPeek,
  prompt,
  children,
}: {
  open: boolean;
  onPeek: () => void;
  prompt: string;
  children: React.ReactNode;
}) {
  if (!open) {
    return (
      <div className="rounded-xl border border-foreground/12 bg-foreground/[0.03] px-3 py-2">
        <p className="text-sm leading-snug text-muted">{prompt}</p>
        <button
          type="button"
          onClick={onPeek}
          className="mt-1 text-xs text-gold/80 underline decoration-transparent underline-offset-2 transition-colors hover:decoration-gold/50"
        >
          예상 먼저 보기
        </button>
      </div>
    );
  }
  return (
    <p className="rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-sm leading-snug text-muted">
      <span className="mr-1 font-medium text-gold">예상</span>
      {children}
    </p>
  );
}

export function TastingNoteWizard({
  wines,
  defaultWineId,
  existing,
}: {
  wines: WineOption[];
  defaultWineId?: string;
  existing?: ExistingNote;
}) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const isEdit = existing != null;
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  // 수정 모드에선 와인을 기본 잠금(다른 와인으로 바꿀 일은 드물다). "와인 변경"을
  // 눌러야 검색 목록이 열린다 — 실수로 딴 와인 리뷰로 바뀌는 걸 막는 안전장치.
  const [changingWine, setChangingWine] = useState(false);
  // 데스크톱은 전체 폼을 한 화면에, 모바일은 토스식 단계별로.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const { watch, setValue, handleSubmit, register, formState } = useForm<
    TastingNoteFormInput,
    unknown,
    TastingNoteInput
  >({
    resolver: zodResolver(tastingNoteSchema),
    defaultValues: existing ? toDefaults(existing) : { wineId: defaultWineId ?? "" },
  });

  const wineId = watch("wineId") as string | undefined;
  const rating = watch("rating") as number | undefined;
  const repurchase = watch("repurchase") as string | undefined;
  const value = watch("value") as string | undefined;
  const colorHex = watch("colorHex") as string | undefined;
  // 구매가는 앞선 "빈티지·구매 정보" 단계에서 입력하고, 값어치(verdict) 단계에서 읽기
  // 전용으로 다시 보여줘 "가격 대비"를 판단할 때 참고하게 한다.
  const purchasePriceRaw = watch("purchasePrice") as string | number | undefined;
  const purchasePriceNum = Number(purchasePriceRaw);
  const purchasePriceLabel =
    purchasePriceRaw !== "" && purchasePriceRaw != null && Number.isFinite(purchasePriceNum)
      ? `${purchasePriceNum.toLocaleString("ko-KR")}원`
      : null;
  const selWine = wines.find((w) => w.id === wineId);
  const currentColor = colorHex ?? defaultColorHex(selWine?.type);
  const colorHint = expectedColorHint(selWine?.type); // 가이드: 예상 색 안내
  // 숙성: 앞 단계에서 적은 빈티지로 나이를 재, 색·향·맛 예상에 곁들인다.
  // 빈티지를 안 적었으면 나이를 모르니 숙성 얘기는 아예 하지 않는다.
  const vintageYearRaw = watch("vintageYear") as string | number | undefined;
  const vintageYearNum = Number(vintageYearRaw);
  const vintageYear =
    vintageYearRaw !== "" && vintageYearRaw != null && Number.isFinite(vintageYearNum)
      ? vintageYearNum
      : null;
  const drankOn = watch("drankOn") as string | undefined;
  const age = wineAgeYears(vintageYear, drankOn);
  const colorAgingNote = age != null ? agingColorNote(age, selWine?.type) : null;
  const flavorAgingNote = age != null ? agingFlavorNote(age, selWine?.type) : null;
  // 산지 기후·도수 — 예상 값을 바꾸지 않고 "이래서 이렇게 치우칠 수 있다"고만 알려준다.
  const aromaClimateNote = climateAromaNote(selWine?.regionName);
  const flavorClimateNote = climateFlavorNote(selWine?.regionName);
  const alcoholNote = abvNote(selWine?.abv);
  // 가이드 향 단계: 예상 향을 출처(품종/숙성)별로 묶어 근거와 함께 보여주고,
  // 사용자가 실제로 맡은 향을 고른다.
  const aromasConfirmed = (watch("aromasConfirmed") as string[] | undefined) ?? [];
  const aromaGroups = useMemo(
    () =>
      expectedAromaGroups({
        grapes: selWine?.grapes ?? [],
        type: selWine?.type,
        vintageYear,
        drankOn,
        oakAging: selWine?.oakAging,
        winemaking: selWine?.winemaking,
      }),
    [selWine, vintageYear, drankOn]
  );
  const expectedAromas = useMemo(() => aromaGroups.flatMap((g) => g.aromas), [aromaGroups]);
  const toggleAroma = (aroma: string) => {
    const next = aromasConfirmed.includes(aroma)
      ? aromasConfirmed.filter((a) => a !== aroma)
      : [...aromasConfirmed, aroma];
    setValue("aromasConfirmed", next, { shouldValidate: true });
  };
  // ── 예상은 "먼저 답한 뒤"에 연다 ─────────────────────────────────────
  // 예상을 먼저 보여주면 거기 매몰된다 — 적힌 색을 보고, 적힌 향을 맡고, 적힌 수준을
  // 고른다. 그래서 각 단계는 스스로 답하기 전까지 예상을 감춘다. 답하면 그 자리에서
  // 열리고, 입력은 계속 열려 있어 고치고 싶으면 고친다(고치라고 묻지는 않는다).
  //
  // 안 답하고도 보고 싶으면 "예상 먼저 보기"로 열 수 있다 — 가이드는 강제가 아니라
  // 곁들임이라는 원칙(docs/guided-tasting.md)을 지킨다.
  // 처음 답을 따로 저장하지는 않는다. 앞뒤 답을 나란히 두면 그 차이가 곧 채점이 된다.
  const [peeked, setPeeked] = useState<Record<string, boolean>>({});
  const peek = (step: string) => setPeeked((p) => ({ ...p, [step]: true }));

  // 양조가 질감에 남기는 결(리 숙성의 크리미함 등). 예상 값은 바꾸지 않는다.
  const winemakingNote = useMemo(() => winemakingFlavorNote(selWine?.winemaking ?? []), [selWine]);
  // 가이드 스월 단계(P4): 눈물자국은 도수가 만든다. 3D 잔과 같은 근거(deriveLegs)를 쓴다.
  const legsFelt = watch("legsFelt") as number | undefined;
  const legsNote = useMemo(() => expectedLegsNote(selWine?.abv), [selWine]);

  // 가이드 맛 단계: 축별 예상 수준을 곁들여 보여주고, 실제로 느낀 정도(1~5)를 받는다.
  const flavorFelt = (watch("flavorFelt") as FlavorFelt | undefined) ?? {};
  // 단맛은 라벨 표기(트로켄·브뤼)가 품종보다 앞선다 — 품종만으로는 못 정하는 경우가 있다.
  const expectedFlavor = useMemo(
    () =>
      expectedFlavorFor(selWine?.grapes ?? [], {
        type: selWine?.type,
        label: [selWine?.nameLocal, selWine?.nameKo, selWine?.classification],
      }),
    [selWine]
  );
  // 예상을 비운 자리에 "왜 안 알려주는지"를 대신 놓는다.
  const sweetNote = useMemo(
    () =>
      sweetnessBreadthNote(selWine?.grapes ?? [], {
        type: selWine?.type,
        label: [selWine?.nameLocal, selWine?.nameKo, selWine?.classification],
      }),
    [selWine]
  );
  const setFlavor = (axis: keyof FlavorFelt, level: number) => {
    // 같은 값을 다시 누르면 해제(평가 안 함)한다.
    const next = { ...flavorFelt };
    if (next[axis] === level) delete next[axis];
    else next[axis] = level;
    setValue("flavorFelt", next, { shouldValidate: true });
  };
  // 프리뷰 absorb·glass 는 실제 렌더(와인/상세 페이지)와 같은 wineGlassFor 파이프라인으로.
  // 색을 안 고르면 타입 추정색(튜닝값), 고르면 그 색. hexToAbsorb 를 직접 쓰면 스케일이
  // 세서 특히 화이트가 어둡고 탁하게 튀었다.
  const { absorb: previewAbsorb, glass: previewGlass } = wineGlassFor(
    selWine?.type ?? "red",
    [],
    undefined,
    colorHex
  );
  const canSave = isEdit || !!wineId;
  const isLast = step === STEPS.length - 1;

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return wines;
    return wines.filter((w) => `${w.nameLocal ?? ""} ${w.nameKo}`.toLowerCase().includes(t));
  }, [q, wines]);

  const save = handleSubmit(async (data) => {
    setServerError(null);
    try {
      const res = await fetch(isEdit ? `/api/tasting-notes/${existing.id}` : "/api/tasting-notes", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json", ...adminHeaders() },
        body: JSON.stringify(data),
      });
      if (res.status === 401) {
        logout();
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        setServerError("저장에 실패했어요.");
        return;
      }
      const id = isEdit ? existing.id : (await res.json()).id;
      router.push(`/journal/${id}`);
    } catch {
      setServerError("저장에 실패했어요.");
    }
  });

  const cur = STEPS[step];

  // 각 단계의 입력 내용(제목·설명 제외). 데스크톱은 모두 펼치고, 모바일은 현재 단계만.
  const stepBody = (key: string) => {
    if (key === "wine") {
      // 수정 모드 기본 상태: 기존 와인을 잠금 카드로 보여주고, "와인 변경"으로만 연다.
      if (isEdit && !changingWine) {
        const nm = selWine ? wineDisplayName(selWine) : null;
        return (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/12 bg-card/60 px-3 py-3">
            <div className="min-w-0">
              {nm ? (
                <>
                  <span className="block truncate text-sm text-foreground">{nm.primary}</span>
                  {nm.alias ? (
                    <span className="block truncate text-xs text-muted">{nm.alias}</span>
                  ) : null}
                </>
              ) : (
                <span className="text-sm text-muted">와인 정보를 불러올 수 없어요.</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setChangingWine(true);
                setQ("");
              }}
              className="shrink-0 rounded-lg border border-foreground/15 px-3 py-1.5 text-sm text-muted transition-colors hover:border-gold/40 hover:text-foreground"
            >
              와인 변경
            </button>
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="와인 이름 검색"
            className={inputClass}
          />
          <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-foreground/10">
            {filtered.map((w) => {
              const nm = wineDisplayName(w);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setValue("wineId", w.id, { shouldValidate: true });
                    // 수정 모드: 고르면 잠금 카드로 복귀. 새 작성(모바일): 다음 단계로.
                    if (isEdit) setChangingWine(false);
                    else if (!isDesktop) setStep(1);
                  }}
                  className={`flex w-full flex-col border-b border-foreground/8 px-3 py-3 text-left last:border-b-0 transition-colors ${
                    wineId === w.id ? "bg-wine/10" : "hover:bg-foreground/5"
                  }`}
                >
                  <span className="text-sm text-foreground">{nm.primary}</span>
                  {nm.alias ? <span className="text-xs text-muted">{nm.alias}</span> : null}
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">목록에 없어요.</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            {/* 찾는 와인이 목록에 없을 때 — 바로 새 와인 등록(검색어를 이름으로 넘김) */}
            <Link
              href={q.trim() ? `/wine/new?name=${encodeURIComponent(q.trim())}` : "/wine/new"}
              className="text-sm text-gold underline decoration-transparent underline-offset-2 transition-colors hover:decoration-gold/50"
            >
              찾는 와인이 없어요? 새 와인 등록 →
            </Link>
            {/* 수정 모드에서 변경을 취소하고 기존 와인 유지 */}
            {isEdit ? (
              <button
                type="button"
                onClick={() => setChangingWine(false)}
                className="shrink-0 text-sm text-muted transition-colors hover:text-foreground"
              >
                변경 취소
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    if (key === "rating")
      return (
        <div className="flex items-center justify-center gap-2 py-6">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setValue("rating", n === rating ? undefined : n)}
              className={`text-5xl transition-colors ${
                rating != null && n <= rating ? "text-gold" : "text-muted/20 hover:text-muted/40"
              }`}
              aria-label={`${n}점`}
            >
              ★
            </button>
          ))}
        </div>
      );

    if (key === "color")
      return (
        <div className="flex flex-col gap-3">
          {/* 예상 색은 먼저 눈으로 보고 맞춘 뒤에 연다 — 먼저 보면 그 색을 찾게 된다. */}
          {colorHint || colorAgingNote ? (
            <Reveal
              open={colorHex != null || peeked.color === true}
              onPeek={() => peek("color")}
              prompt="잔을 기울여 색부터 맞춰 보세요. 맞추면 예상 색을 알려드릴게요."
            >
              {colorHint}
              {/* 빈티지를 적었으면 나이가 색에 남긴 흔적도 덧붙인다. */}
              {colorAgingNote ? <span className="block mt-1">{colorAgingNote}</span> : null}
            </Reveal>
          ) : null}
          <div
            className="relative mx-auto h-72 w-full max-w-[19rem] overflow-hidden rounded-2xl border border-foreground/12"
            style={{ backgroundColor: CANVAS_RENDERED }}
          >
            <FluidLab
              wineAbsorb={previewAbsorb}
              abv={selWine?.abv}
              glassType={previewGlass}
              bgColor={CANVAS_BG}
              swirlScale={0.4}
            />
          </div>
          <WineColorPicker
            color={currentColor}
            onChange={(hex) => setValue("colorHex", hex)}
            onClear={() => setValue("colorHex", undefined)}
            showClear={!!colorHex}
          />
          {/* 스월·외관(P4) — 색을 본 다음 자연스럽게 잔을 돌리게 된다. 그래서 단계를
              새로 만들지 않고 여기 잇는다(잔 프리뷰도 이미 위에 있다). */}
          {legsNote ? (
            <div className="mt-2 border-foreground/10 border-t pt-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm text-foreground">눈물자국</span>
                <span className="text-xs text-muted/70">잔을 돌린 뒤 벽을 보세요</span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setValue("legsFelt", n === legsFelt ? undefined : n)}
                    aria-label={`눈물자국 ${n}단계`}
                    aria-pressed={legsFelt === n}
                    className={`flex-1 rounded-lg border py-2.5 text-sm transition-colors ${
                      legsFelt != null && n <= legsFelt
                        ? "border-gold/50 bg-gold/10 text-foreground"
                        : "border-foreground/15 text-muted hover:border-gold/40"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted/70">
                <span>가늘고 빠르다</span>
                <span>굵고 느리다</span>
              </div>
              <div className="mt-2">
                <Reveal
                  open={legsFelt != null || peeked.legs === true}
                  onPeek={() => peek("legs")}
                  prompt="돌려서 흘러내리는 걸 보고 표시해 보세요. 표시하면 예상을 알려드릴게요."
                >
                  {legsNote}
                </Reveal>
              </div>
            </div>
          ) : null}
        </div>
      );

    if (key === "aroma") {
      // 예상 목록에 없지만 이미 고른 향(편집 시 데이터가 바뀐 경우)은 따로 묶어 남긴다.
      // 팔레트에 없는데 이미 고른 향(옛 데이터·품종 변경)은 지워지지 않게 따로 남긴다.
      const extras = aromasConfirmed.filter((a) => !ALL_PALETTE_AROMAS.includes(a));
      const chip = (aroma: string) => {
        const on = aromasConfirmed.includes(aroma);
        return (
          <button
            key={aroma}
            type="button"
            onClick={() => toggleAroma(aroma)}
            aria-pressed={on}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              on
                ? "border-gold/50 bg-gold/10 text-foreground"
                : "border-foreground/15 text-muted hover:border-gold/40 hover:text-foreground"
            }`}
          >
            {aroma}
          </button>
        );
      };
      // 예상은 고른 뒤에 연다. 예상 향만 칩으로 깔면 그 목록이 곧 답안지가 되어,
      // 적힌 향을 맡게 되고 목록에 없는 향은 고를 수도 없다. 그래서 넓은 어휘
      // (AROMA_PALETTE)를 먼저 깔고, 고른 뒤에 무엇이 예상이었는지 알려준다.
      const aromaOpen = aromasConfirmed.length > 0 || peeked.aroma === true;
      const missed = expectedAromas.filter((a) => !aromasConfirmed.includes(a));
      const hit = aromasConfirmed.filter((a) => expectedAromas.includes(a));
      return (
        <div className="flex flex-col gap-4">
          {aromaGroups.length === 0 ? (
            <p className="rounded-xl border border-foreground/12 bg-foreground/[0.03] px-3 py-2 text-sm leading-snug text-muted">
              이 와인은 예상 향 정보가 아직 없어요. 맡은 향을 자유롭게 골라 주세요.
            </p>
          ) : (
            <Reveal
              open={aromaOpen}
              onPeek={() => peek("aroma")}
              prompt="먼저 코를 대고, 맡은 향을 골라 보세요. 고르면 이 와인에서 예상되던 향을 알려드릴게요."
            >
              <span className="block">이 와인의 품종·숙성·오크에서 오는 향이에요.</span>
              {aromaGroups.map((group) => (
                <span key={group.source} className="mt-1.5 block">
                  <span className="font-medium text-gold/90">{group.source}</span>{" "}
                  {group.aromas.join(" · ")}
                  <span className="block text-xs text-muted/80">{group.why}</span>
                </span>
              ))}
              {hit.length > 0 ? (
                <span className="mt-1.5 block">
                  이 중 <span className="text-foreground">{hit.join(" · ")}</span> 를 찾으셨어요.
                </span>
              ) : null}
              {missed.length > 0 ? (
                <span className="mt-1.5 block text-xs">
                  아직 안 고른 예상 향: {missed.join(" · ")} — 다시 맡아보고 있으면 더해 주세요.
                </span>
              ) : null}
            </Reveal>
          )}
          {/* 어휘 팔레트 — 답이 아니라 "무엇을 고를 수 있는지"다. 계열로 좁혀 간다. */}
          {AROMA_PALETTE.map((cat) => (
            <div key={cat.name}>
              <div className="mb-1.5">
                <span className="text-sm font-medium text-foreground">{cat.name}</span>
                <p className="mt-0.5 text-xs leading-snug text-muted">{cat.hint}</p>
              </div>
              <div className="flex flex-wrap gap-2">{cat.aromas.map(chip)}</div>
            </div>
          ))}
          {extras.length > 0 ? (
            <div>
              <span className="text-sm font-medium text-muted">그 밖에 고른 향</span>
              <div className="mt-1.5 flex flex-wrap gap-2">{extras.map(chip)}</div>
            </div>
          ) : null}
          {/* 아래 두 줄은 향을 더하는 게 아니라 "어느 쪽으로 치우칠지"를 알려주는 안내다. */}
          {aromaClimateNote ? (
            <p className="text-xs leading-snug text-muted">{aromaClimateNote}</p>
          ) : null}
          {/* 오크를 안 썼다는 것도 힌트다 — 배럴 향에 가리지 않은 과실을 찾아보게 한다. */}
          {oakNone(selWine?.oakAging) ? (
            <p className="text-xs leading-snug text-muted">
              오크통을 쓰지 않은 와인이라 바닐라·토스트 같은 나무 향 대신 과실이 그대로 드러나요.
            </p>
          ) : null}
        </div>
      );
    }

    if (key === "flavor") {
      const hasAnyExpected = FLAVOR_AXES.some(({ key: axis }) => expectedFlavor[axis]);
      return (
        <div className="flex flex-col gap-4">
          <p
            className={`rounded-xl px-3 py-2 text-sm leading-snug text-muted ${
              hasAnyExpected
                ? "border border-gold/25 bg-gold/5"
                : "border border-foreground/12 bg-foreground/[0.03]"
            }`}
          >
            {hasAnyExpected
              ? // 예상 수준은 축마다 따로, 그 축을 표시한 뒤에 옆에 뜬다(아래 참고).
                "한 모금 머금고 축마다 느낀 만큼 표시해 보세요. 표시하면 그 축의 예상 수준을 알려드릴게요."
              : "이 와인은 예상 맛 정보가 아직 없어요. 느낀 만큼 자유롭게 표시해 주세요."}
            {/* 빈티지를 적었으면 나이가 맛(특히 타닌)에 남긴 흔적도 덧붙인다. */}
            {flavorAgingNote ? <span className="block mt-1">{flavorAgingNote}</span> : null}
            {/* 산지 기후·도수는 예상 값을 바꾸지 않고 치우칠 방향만 알려준다. */}
            {flavorClimateNote ? <span className="block mt-1">{flavorClimateNote}</span> : null}
            {alcoholNote ? <span className="block mt-1">{alcoholNote}</span> : null}
            {/* 단맛 예상을 비웠으면 그 이유를 알린다(모르는 걸 아는 척하지 않는다). */}
            {sweetNote ? <span className="block mt-1">{sweetNote}</span> : null}
            {/* 양조가 질감에 남기는 결(리 숙성의 크리미함 등). 예상 값은 바꾸지 않는다. */}
            {winemakingNote ? <span className="block mt-1">{winemakingNote}</span> : null}
          </p>
          {FLAVOR_AXES.map(({ key: axis, label, low, high }) => (
            <div key={axis}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm text-foreground">{label}</span>
                {/* 축을 표시하기 전엔 예상을 감춘다 — 먼저 보면 그 칸을 고르게 된다.
                    표시하면 그 자리에서 열리고, 고치고 싶으면 그냥 다시 누르면 된다. */}
                {expectedFlavor[axis] ? (
                  flavorFelt[axis] != null || peeked[`flavor:${axis}`] === true ? (
                    <span className="text-xs text-gold/90">예상 {expectedFlavor[axis]}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => peek(`flavor:${axis}`)}
                      className="text-xs text-muted/70 underline decoration-transparent underline-offset-2 transition-colors hover:decoration-muted/50"
                    >
                      예상 먼저 보기
                    </button>
                  )
                ) : null}
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFlavor(axis, n)}
                    aria-label={`${label} ${n}단계`}
                    aria-pressed={flavorFelt[axis] === n}
                    className={`flex-1 rounded-lg border py-2.5 text-sm transition-colors ${
                      flavorFelt[axis] != null && n <= (flavorFelt[axis] ?? 0)
                        ? "border-gold/50 bg-gold/10 text-foreground"
                        : "border-foreground/15 text-muted hover:border-gold/40"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted/70">
                <span>{low}</span>
                <span>{high}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (key === "verdict")
      return (
        <div className="flex flex-col gap-6">
          <div>
            {/* 구매가는 앞 단계에서 입력한 값을 상기시켜, 가격 대비 판단에 참고. */}
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm text-muted">가격 대비</p>
              <span className="text-xs text-muted/70">
                {purchasePriceLabel ? `구매가 ${purchasePriceLabel}` : "구매가 미입력"}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {VALUE_OPTS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setValue("value", opt === value ? undefined : opt)}
                  className={`rounded-xl border px-1 py-2.5 text-xs leading-tight transition-colors ${
                    value === opt
                      ? "border-gold/50 bg-gold/10 text-foreground"
                      : "border-foreground/15 text-muted"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted">다시 살까?</p>
            <div className="flex gap-2">
              {REPURCHASE_OPTS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setValue("repurchase", opt === repurchase ? undefined : opt)}
                  className={`flex-1 rounded-xl border py-3 text-base transition-colors ${
                    repurchase === opt
                      ? "border-gold/50 bg-gold/10 text-foreground"
                      : "border-foreground/15 text-muted"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      );

    if (key === "note")
      return (
        <div className="flex flex-col gap-4">
          <textarea
            rows={5}
            placeholder="기억에 남은 인상, 마신 자리 등"
            className={`${inputClass} resize-y`}
            {...register("bodyText")}
          />
          <input
            type="text"
            placeholder="함께한 음식 (예: 스테이크)"
            className={inputClass}
            {...register("foodPaired")}
          />
        </div>
      );

    if (key === "buy")
      return (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted">
            빈티지 (병에 적힌 연도)
            <input
              type="number"
              inputMode="numeric"
              placeholder="예: 2021"
              className={inputClass}
              {...register("vintageYear")}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            구매가격(원)
            <input
              type="number"
              inputMode="numeric"
              placeholder="예: 31920"
              className={inputClass}
              {...register("purchasePrice")}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            구매일
            <input type="date" className={inputClass} {...register("purchasedOn")} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            음용일
            <input type="date" className={inputClass} {...register("drankOn")} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm text-muted">
            구매처
            <input type="text" className={inputClass} {...register("purchasePlace")} />
          </label>
        </div>
      );

    return null;
  };

  // ── 데스크톱: 전체 폼을 한 화면에(모든 단계 펼침, 저장 한 번). ──
  if (isDesktop) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col gap-8">
          {STEPS.map((s) => (
            <section key={s.key}>
              <h2 className="font-serif text-xl leading-tight text-foreground">{s.title}</h2>
              <p className="mt-0.5 text-sm text-muted">{s.sub}</p>
              <div className="mt-4">{stepBody(s.key)}</div>
            </section>
          ))}
        </div>
        {serverError ? <p className="mt-4 text-sm text-wine-bright">{serverError}</p> : null}
        <div className="sticky bottom-0 mt-8 flex justify-end bg-gradient-to-t from-background via-background/95 to-transparent py-4">
          {canSave ? (
            <button
              type="button"
              onClick={save}
              disabled={formState.isSubmitting}
              className="rounded-xl bg-wine px-6 py-3 font-medium text-on-accent transition-colors hover:bg-wine-bright disabled:opacity-40"
            >
              {formState.isSubmitting ? "저장 중…" : "저장"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // ── 모바일: 토스식 단계별 ──
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col">
      {/* 진행 바 — 각 칸을 눌러 그 단계로 바로 이동(특히 수정 시) */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(i)}
            aria-label={s.title}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-wine" : "bg-foreground/12 hover:bg-foreground/25"
            }`}
          />
        ))}
      </div>

      {/* 단계 내용 */}
      <div className="mt-6 flex-1">
        <h1 className="font-serif text-2xl leading-tight text-foreground">{cur.title}</h1>
        <p className="mt-1 text-sm text-muted">{cur.sub}</p>
        <div className="mt-6">{stepBody(cur.key)}</div>
      </div>

      {serverError ? <p className="mt-3 text-sm text-wine-bright">{serverError}</p> : null}

      {/* 내비 — 언제든 저장 가능(와인만 고르면) */}
      <div className="sticky bottom-0 mt-6 flex items-center gap-2 bg-gradient-to-t from-background via-background/95 to-transparent py-4">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded-xl border border-foreground/15 px-4 py-3 text-sm text-muted transition-colors hover:text-foreground"
          >
            이전
          </button>
        ) : null}
        {!isLast ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && !wineId}
            className="flex-1 rounded-xl bg-wine px-4 py-3 font-medium text-on-accent transition-colors hover:bg-wine-bright disabled:opacity-40"
          >
            다음
          </button>
        ) : null}
        {canSave ? (
          <button
            type="button"
            onClick={save}
            disabled={formState.isSubmitting}
            className={`rounded-xl px-4 py-3 font-medium transition-colors disabled:opacity-40 ${
              isLast
                ? "flex-1 bg-wine text-on-accent hover:bg-wine-bright"
                : "border border-wine/40 text-wine hover:bg-wine/10"
            }`}
          >
            {formState.isSubmitting ? "저장 중…" : "저장"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
