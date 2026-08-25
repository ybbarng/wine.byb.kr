import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { LoginForm } from "@/features/admin/login-form";

export const metadata: Metadata = {
  title: "관리자 로그인",
  robots: { index: false },
};

export default function AdminLoginPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 pb-24">
        <h1 className="font-serif text-3xl tracking-tight text-foreground">관리자</h1>
        <p className="mt-2 text-sm text-muted/60">
          기록을 쓰고 고치려면 로그인하세요. 조회는 로그인 없이도 됩니다.
        </p>
        <LoginForm />
      </main>
    </div>
  );
}
