"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "./auth-store";

// 로그인하지 않았으면 로그인 페이지로 보낸다. 편집 화면을 감싸는 용도.
// 로컬 개발(next dev)에서는 로그인 없이 통과 — 배포는 production 이라 영향 없음.
const DEV_BYPASS = process.env.NODE_ENV === "development";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const password = useAuthStore((s) => s.password);

  useEffect(() => {
    if (!DEV_BYPASS && hasHydrated && !password) router.replace("/admin/login");
  }, [hasHydrated, password, router]);

  if (DEV_BYPASS) return <>{children}</>;
  if (!hasHydrated || !password) return null;
  return <>{children}</>;
}
