"use client";

import Link from "next/link";
import { useAuthStore } from "./auth-store";

// 헤더에서 로그인 상태를 보여준다. 하이드레이션 전에는 아무것도 그리지 않아 깜빡임을 막는다.
export function AdminBadge() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const password = useAuthStore((s) => s.password);
  const logout = useAuthStore((s) => s.logout);

  if (!hasHydrated) return null;

  if (!password) {
    return (
      <Link href="/admin/login" className="text-rose/40 transition-colors hover:text-foreground">
        로그인
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <span className="text-gold">관리자</span>
      <button
        type="button"
        onClick={logout}
        className="text-rose/40 transition-colors hover:text-foreground"
      >
        로그아웃
      </button>
    </span>
  );
}
