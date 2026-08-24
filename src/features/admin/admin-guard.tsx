"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "./auth-store";

// 로그인하지 않았으면 로그인 페이지로 보낸다. 편집 화면을 감싸는 용도.
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const password = useAuthStore((s) => s.password);

  useEffect(() => {
    if (hasHydrated && !password) router.replace("/admin/login");
  }, [hasHydrated, password, router]);

  if (!hasHydrated || !password) return null;
  return <>{children}</>;
}
