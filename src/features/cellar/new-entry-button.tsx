"use client";

import Link from "next/link";
import { useAuthStore } from "@/features/admin/auth-store";

// 로그인한 관리자에게만 "새 기록" 버튼을 보인다.
export function NewEntryButton() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const password = useAuthStore((s) => s.password);

  if (!hasHydrated || !password) return null;

  return (
    <Link
      href="/cellar/new"
      className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm text-gold transition-colors hover:bg-gold/20"
    >
      + 새 기록
    </Link>
  );
}
