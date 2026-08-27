"use client";

import Link from "next/link";
import { useAuthStore } from "@/features/admin/auth-store";

// 상세 페이지에서 로그인한 관리자에게만 "수정" 버튼을 보인다. 삭제는 수정 폼 안에 있다.
// 로컬 개발(next dev)에서는 로그인 없이 항상 노출 — 배포는 production 이라 영향 없음.
const DEV_BYPASS = process.env.NODE_ENV === "development";

export function NoteActions({ id }: { id: string }) {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const password = useAuthStore((s) => s.password);

  if (!DEV_BYPASS && (!hasHydrated || !password)) return null;

  return (
    <Link
      href={`/journal/${id}/edit`}
      className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm text-gold transition-colors hover:bg-gold/20"
    >
      수정
    </Link>
  );
}
