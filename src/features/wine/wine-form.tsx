"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { adminHeaders, useAuthStore } from "@/features/admin/auth-store";
import { wineTypeLabel } from "@/lib/wine";
import { WINE_TYPES, type WineFormInput, type WineInput, wineSchema } from "./wine-schema";

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

export function WineForm({ defaultName }: { defaultName?: string }) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WineFormInput, unknown, WineInput>({
    resolver: zodResolver(wineSchema),
    // 기록 작성 중 "새 와인 등록"으로 왔으면 검색어를 이름에 미리 채운다.
    defaultValues: { nameKo: defaultName ?? "" },
  });

  async function onSubmit(data: WineInput) {
    setServerError(null);
    const res = await fetch("/api/wines", {
      method: "POST",
      headers: { "content-type": "application/json", ...adminHeaders() },
      body: JSON.stringify(data),
    });
    if (res.status === 401) {
      logout();
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setServerError(body?.error ?? "저장에 실패했습니다.");
      return;
    }
    const created = await res.json();
    // 등록한 와인을 미리 고른 채로 기록 작성 화면으로.
    router.push(`/journal/new?wineId=${created.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5">
      <Field label="이름 (한국어)">
        <input
          type="text"
          placeholder="예: 이기갈 꼬뜨 뒤 론 블랑"
          className={inputClass}
          {...register("nameKo")}
        />
        {errors.nameKo ? (
          <span className="text-xs text-wine-bright">{errors.nameKo.message}</span>
        ) : null}
      </Field>

      <Field label="이름 (원어)">
        <input
          type="text"
          placeholder="예: E. Guigal Côtes du Rhône Blanc"
          className={inputClass}
          {...register("nameLocal")}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="종류">
          <select className={inputClass} defaultValue="" {...register("type")}>
            <option value="">선택 안 함</option>
            {WINE_TYPES.map((t) => (
              <option key={t} value={t}>
                {wineTypeLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="도수(%)">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="예: 14"
            className={inputClass}
            {...register("abv")}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="국가">
          <input
            type="text"
            placeholder="예: 프랑스"
            className={inputClass}
            {...register("country")}
          />
        </Field>
        <Field label="생산자">
          <input
            type="text"
            placeholder="예: 이기갈"
            className={inputClass}
            {...register("producer")}
          />
        </Field>
      </div>

      <Field label="등급">
        <input
          type="text"
          placeholder="예: Côtes du Rhône AOC"
          className={inputClass}
          {...register("classification")}
        />
      </Field>

      <Field label="품종">
        <input
          type="text"
          placeholder="예: 비오니에 70, 루산느 10, …"
          className={inputClass}
          {...register("blendRaw")}
        />
      </Field>

      {serverError ? <p className="text-sm text-wine-bright">{serverError}</p> : null}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-wine px-5 py-3 font-medium text-on-accent transition-colors hover:bg-wine-bright disabled:opacity-40"
        >
          {isSubmitting ? "저장 중…" : "와인 등록"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/journal/new")}
          className="text-sm text-muted/50 transition-colors hover:text-foreground"
        >
          취소
        </button>
      </div>
    </form>
  );
}
