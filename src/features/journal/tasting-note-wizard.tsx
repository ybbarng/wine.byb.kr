"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { adminHeaders, useAuthStore } from "@/features/admin/auth-store";
import { WineColorPicker } from "@/features/wine/wine-color-picker";
import { defaultColorHex, wineGlassFor } from "@/features/wine/wine-glass";
import { wineDisplayName } from "@/lib/wine";
import { type ExistingNote, toDefaults, type WineOption } from "./tasting-note-form";
import {
  type TastingNoteFormInput,
  type TastingNoteInput,
  tastingNoteSchema,
} from "./tasting-note-schema";

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

// 중요한 것부터. 각 단계는 한 가지에 집중(토스 스타일).
const STEPS = [
  { key: "wine", title: "어떤 와인이에요?", sub: "기록할 와인을 골라요" },
  { key: "rating", title: "몇 점이었어요?", sub: "전체 인상을 별로" },
  { key: "color", title: "무슨 색이었어요?", sub: "실제 잔을 보며 맞춰요" },
  { key: "verdict", title: "어땠어요?", sub: "구매가를 보며 값어치와 재구매를" },
  { key: "note", title: "한마디 남긴다면?", sub: "향·맛·안주 등 자유롭게" },
  { key: "buy", title: "언제·어디서 샀어요?", sub: "선택 — 없으면 건너뛰어요" },
] as const;

const inputClass =
  "w-full rounded-xl border border-foreground/20 bg-card/60 px-3 py-3 text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-gold/50";

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
  const selWine = wines.find((w) => w.id === wineId);
  const currentColor = colorHex ?? defaultColorHex(selWine?.type);
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
          <div
            className="relative mx-auto h-72 w-full max-w-[19rem] overflow-hidden rounded-2xl border border-foreground/12"
            style={{ backgroundColor: CANVAS_RENDERED }}
          >
            <FluidLab
              wineAbsorb={previewAbsorb}
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
        </div>
      );

    if (key === "verdict")
      return (
        <div className="flex flex-col gap-6">
          {/* 가격을 여기서 함께 — 가격 대비를 판단할 때 구매가가 바로 보이도록. */}
          <div>
            <p className="mb-2 text-sm text-muted">이 와인, 얼마에 샀어요?</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="예: 31920"
                className={inputClass}
                {...register("purchasePrice")}
              />
              <span className="shrink-0 text-sm text-muted">원</span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted">가격 대비</p>
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
            placeholder="향·맛·인상, 안주 등"
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
            음용일
            <input type="date" className={inputClass} {...register("drankOn")} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            구매일
            <input type="date" className={inputClass} {...register("purchasedOn")} />
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
