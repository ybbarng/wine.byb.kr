"use client";

import Link from "next/link";
import { useAuthStore } from "@/features/admin/auth-store";

// 로그인한 관리자에게만 보인다. 로컬 개발(next dev)에선 로그인 없이 노출.
const DEV_BYPASS = process.env.NODE_ENV === "development";

// "새 와인"(구매 직후 등록) + "새 기록"(시음 노트) 두 진입점.
export function NewEntryButton() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const password = useAuthStore((s) => s.password);

  if (!DEV_BYPASS && (!hasHydrated || !password)) return null;

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/wine/new"
        className="rounded-lg border border-foreground/15 bg-card/60 px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        + 새 와인
      </Link>
      <Link
        href="/journal/new"
        className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm text-gold transition-colors hover:bg-gold/20"
      >
        + 새 기록
      </Link>
    </div>
  );
}
