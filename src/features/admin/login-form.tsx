"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "./auth-store";
import { verifyPassword } from "./verify";

export function LoginForm() {
  const router = useRouter();
  const setPassword = useAuthStore((s) => s.setPassword);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await verifyPassword(value);
    setLoading(false);
    if (ok) {
      setPassword(value);
      router.push("/cellar");
    } else {
      setError("비밀번호가 올바르지 않습니다.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
      <label htmlFor="admin-password" className="text-sm text-muted/70">
        관리자 비밀번호
      </label>
      <input
        id="admin-password"
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="current-password"
        className="rounded-xl border border-foreground/20 bg-card/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted/70 focus:border-gold/50"
        placeholder="비밀번호"
      />
      {error ? <p className="text-sm text-wine-bright">{error}</p> : null}
      <button
        type="submit"
        disabled={loading || value.length === 0}
        className="mt-1 rounded-xl bg-wine px-4 py-3 font-medium text-on-accent transition-colors hover:bg-wine-bright disabled:opacity-40"
      >
        {loading ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
