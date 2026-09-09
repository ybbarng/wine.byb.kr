"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { adminHeaders, useAuthStore } from "@/features/admin/auth-store";
import { WineColorPicker } from "@/features/wine/wine-color-picker";
import { defaultColorHex, hexToAbsorb, wineGlassFor } from "@/features/wine/wine-glass";
import { wineDisplayName } from "@/lib/wine";
import {
  type FlavorFelt,
  type TastingNoteFormInput,
  type TastingNoteInput,
  tastingNoteSchema,
} from "./tasting-note-schema";

const FluidLab = dynamic(() => import("@/components/FluidLab"), {
  ssr: false,
  loading: () => null,
});

export interface WineOption {
  id: string;
  nameKo: string;
  nameLocal: string | null;
  type: string | null;
  colorHex: string | null;
  // 오크 숙성 정도(none|light|heavy). 오크에서 오는 향의 근거.
  oakAging: string | null;
  // 도수·산지 — 질감(바디)과 기후 안내의 근거.
  abv: number | null;
  // 등급 표기 — 단맛을 품종이 못 정할 때 라벨에서 읽는 근거(트로켄·브뤼 등).
  classification: string | null;
  regionName: string | null;
  // 가이드 시음 향 단계(P2)의 예상 향 계산용 — 비율순 품종 이름.
  grapes: string[];
}

// 수정 모드에서 폼을 채울 기존 값. 날짜는 서버에서 "YYYY-MM-DD"로 넘긴다.
export interface ExistingNote {
  id: string;
  wineId: string;
  drankOn: string | null;
  purchasedOn: string | null;
  vintageYear: number | null;
  purchasePrice: number | null;
  purchasePlace: string | null;
  rating: number | null;
  repurchase: string | null;
  value: string | null;
  colorHex: string | null;
  aromasConfirmed: string[];
  flavorFelt: FlavorFelt;
  legsFelt: number | null;
  bodyText: string | null;
  foodPaired: string | null;
}

export function toDefaults(n: ExistingNote): TastingNoteFormInput {
  return {
    wineId: n.wineId,
    drankOn: n.drankOn ?? "",
    purchasedOn: n.purchasedOn ?? "",
    vintageYear: n.vintageYear?.toString() ?? "",
    purchasePrice: n.purchasePrice?.toString() ?? "",
    purchasePlace: n.purchasePlace ?? "",
    rating: n.rating ?? undefined,
    repurchase: (n.repurchase as TastingNoteFormInput["repurchase"]) ?? undefined,
    value: (n.value as TastingNoteFormInput["value"]) ?? undefined,
    colorHex: n.colorHex ?? undefined,
    aromasConfirmed: n.aromasConfirmed,
    flavorFelt: n.flavorFelt,
    legsFelt: n.legsFelt ?? undefined,
    bodyText: n.bodyText ?? "",
    foodPaired: n.foodPaired ?? "",
  };
}

// 버튼형 선택(다시 살까·가격 대비)용 옵션.
const REPURCHASE_OPTS = ["응", "아마", "아니"] as const;
const VALUE_OPTS = ["만족", "보통", "아쉬움"] as const;

const inputClass =
  "w-full rounded-lg border border-foreground/20 bg-card/60 px-3 py-2 text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-gold/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted/70">{label}</span>
      {children}
    </label>
  );
}

export function TastingNoteForm({
  wines,
  existing,
  defaultWineId,
}: {
  wines: WineOption[];
  existing?: ExistingNote;
  defaultWineId?: string;
}) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isEdit = existing != null;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TastingNoteFormInput, unknown, TastingNoteInput>({
    resolver: zodResolver(tastingNoteSchema),
    defaultValues: existing ? toDefaults(existing) : { wineId: defaultWineId ?? "" },
  });

  // 스키마 입력 타입상 느슨하게 나오므로 별점 계산을 위해 number로 좁힌다.
  const rating = watch("rating") as number | undefined;
  const repurchase = watch("repurchase") as string | undefined;
  const value = watch("value") as string | undefined;
  // 색: 이때 관측한 와인 색. 선택 와인의 종류로 시작 색을 잡고, 고르면 잔에 실시간 반영.
  const wineId = watch("wineId") as string | undefined;
  const selWine = wines.find((w) => w.id === wineId);
  const colorHex = watch("colorHex") as string | undefined;
  const currentColor = colorHex ?? defaultColorHex(selWine?.type);
  const previewAbsorb = hexToAbsorb(currentColor) ?? [16, 78, 98];
  const previewGlass = wineGlassFor(selWine?.type ?? "red", []).glass;

  function handleAuthFail() {
    logout();
    router.push("/admin/login");
  }

  async function onSubmit(data: TastingNoteInput) {
    setServerError(null);
    const res = await fetch(isEdit ? `/api/tasting-notes/${existing.id}` : "/api/tasting-notes", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json", ...adminHeaders() },
      body: JSON.stringify(data),
    });
    if (res.status === 401) return handleAuthFail();
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setServerError(body?.error ?? "저장에 실패했습니다.");
      return;
    }
    router.push(isEdit ? `/journal/${existing.id}` : "/journal");
    router.refresh();
  }

  async function onDelete() {
    if (!existing || !window.confirm("이 기록을 삭제할까요?")) return;
    setDeleting(true);
    const res = await fetch(`/api/tasting-notes/${existing.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    setDeleting(false);
    if (res.status === 401) return handleAuthFail();
    if (!res.ok) {
      setServerError("삭제에 실패했습니다.");
      return;
    }
    router.push("/journal");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5">
      <Field label="와인">
        <select className={inputClass} {...register("wineId")}>
          <option value="" disabled>
            와인 선택
          </option>
          {wines.map((w) => {
            const name = wineDisplayName(w);
            return (
              <option key={w.id} value={w.id}>
                {name.primary}
                {name.alias ? ` (${name.alias})` : ""}
              </option>
            );
          })}
        </select>
        <div className="flex items-center justify-between">
          {errors.wineId ? (
            <span className="text-xs text-wine-bright">{errors.wineId.message}</span>
          ) : (
            <span />
          )}
          <Link href="/wine/new" className="text-xs text-gold/80 hover:text-gold">
            목록에 없어요? 새 와인 추가
          </Link>
        </div>
      </Field>

      {/* 와인 색 — 이날 관측한 색을 골라 저장. 잔에 실시간 미리보기. */}
      <Field label="와인 색 (이날 관측)">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-xl border border-foreground/12 bg-card/40 sm:h-32 sm:w-40">
            <FluidLab
              wineAbsorb={previewAbsorb}
              abv={selWine?.abv}
              glassType={previewGlass}
              swirlScale={0.4}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <WineColorPicker
              color={currentColor}
              onChange={(hex) => setValue("colorHex", hex, { shouldValidate: true })}
              onClear={() => setValue("colorHex", undefined, { shouldValidate: true })}
              showClear={!!colorHex}
            />
            <p className="text-[11px] leading-snug text-muted/60">
              실제 잔을 보며 색을 맞춰 저장하세요. 와인 페이지 색은 기록들의 평균이 됩니다.
            </p>
          </div>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="음용일">
          <input type="date" className={inputClass} {...register("drankOn")} />
        </Field>
        <Field label="구매일">
          <input type="date" className={inputClass} {...register("purchasedOn")} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="빈티지">
          <input
            type="number"
            inputMode="numeric"
            placeholder="예: 2021"
            className={inputClass}
            {...register("vintageYear")}
          />
        </Field>
        <Field label="구매가격(원)">
          <input
            type="number"
            inputMode="numeric"
            placeholder="예: 31920"
            className={inputClass}
            {...register("purchasePrice")}
          />
        </Field>
      </div>

      <Field label="구매처">
        <input
          type="text"
          placeholder="예: 세븐일레븐"
          className={inputClass}
          {...register("purchasePlace")}
        />
      </Field>

      <Field label="평점">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() =>
                setValue("rating", n === rating ? undefined : n, { shouldValidate: true })
              }
              className={`text-2xl transition-colors ${
                rating != null && n <= rating ? "text-gold" : "text-muted/25 hover:text-muted/50"
              }`}
              aria-label={`${n}점`}
            >
              ★
            </button>
          ))}
          {rating != null ? <span className="ml-2 text-sm text-muted/60">{rating}점</span> : null}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="다시 살까?">
          <div className="flex gap-1.5">
            {REPURCHASE_OPTS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  setValue("repurchase", opt === repurchase ? undefined : opt, {
                    shouldValidate: true,
                  })
                }
                className={`flex-1 rounded-lg border px-2 py-2 text-sm transition-colors ${
                  repurchase === opt
                    ? "border-gold/50 bg-gold/10 text-foreground"
                    : "border-foreground/15 text-muted hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </Field>
        <Field label="가격 대비">
          <div className="flex gap-1.5">
            {VALUE_OPTS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  setValue("value", opt === value ? undefined : opt, { shouldValidate: true })
                }
                className={`flex-1 rounded-lg border px-2 py-2 text-sm transition-colors ${
                  value === opt
                    ? "border-gold/50 bg-gold/10 text-foreground"
                    : "border-foreground/15 text-muted hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="감상">
        <textarea
          rows={5}
          placeholder="맛·향·인상, 안주 등"
          className={`${inputClass} resize-y`}
          {...register("bodyText")}
        />
      </Field>

      <Field label="페어링">
        <input
          type="text"
          placeholder="예: 추어탕, 스테이크"
          className={inputClass}
          {...register("foodPaired")}
        />
      </Field>

      {serverError ? <p className="text-sm text-wine-bright">{serverError}</p> : null}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-wine px-5 py-3 font-medium text-on-accent transition-colors hover:bg-wine-bright disabled:opacity-40"
        >
          {isSubmitting ? "저장 중…" : isEdit ? "수정 저장" : "기록 저장"}
        </button>
        <button
          type="button"
          onClick={() => router.push(isEdit && existing ? `/journal/${existing.id}` : "/journal")}
          className="text-sm text-muted/50 transition-colors hover:text-foreground"
        >
          취소
        </button>
        {isEdit ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="ml-auto text-sm text-wine-bright/80 transition-colors hover:text-wine-bright disabled:opacity-40"
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
