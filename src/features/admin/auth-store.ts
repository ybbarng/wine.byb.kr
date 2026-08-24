"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// 편집 권한 상태. 로그인 시 확인된 비밀번호를 localStorage에 보관하고,
// 편집 요청마다 x-admin-password 헤더로 함께 보낸다(세션 쿠키는 두지 않는다).
// XSS로 읽힐 수 있는 값이라 단일 관리자(나)만 쓰는 도구 전제에서만 이 방식을 쓴다.
interface AuthState {
  password: string | null;
  hasHydrated: boolean;
  setPassword: (pw: string) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      password: null,
      hasHydrated: false,
      setPassword: (password) => set({ password }),
      logout: () => set({ password: null }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "wine-admin",
      partialize: (s) => ({ password: s.password }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);

/** 편집 요청에 실을 헤더. 비로그인 상태면 빈 객체. */
export function adminHeaders(): Record<string, string> {
  const pw = useAuthStore.getState().password;
  return pw ? { "x-admin-password": pw } : {};
}
