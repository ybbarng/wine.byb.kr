import Link from "next/link";
import { AdminBadge } from "@/features/admin/admin-badge";
import { BrandLogo } from "./BrandLogo";

const NAV = [
  { href: "/explore", label: "탐험" },
  { href: "/catalog", label: "도감" },
  { href: "/journal", label: "기록" },
  { href: "/learn", label: "학습" },
];

// 콘텐츠 페이지(기록·학습 등)의 상단 헤더. 홈/쇼케이스의 ShowcaseHeader와
// 같은 브랜딩·헤어라인을 쓰되, 풀스크린 검색 대신 단순 내비만 둔다.
export function SiteHeader() {
  return (
    <header className="relative">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
        <BrandLogo />
        <nav className="flex items-center gap-5 text-sm text-muted">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <AdminBadge />
        </nav>
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(110,26,51,0.15) 25%, rgba(110,26,51,0.15) 75%, transparent)",
        }}
      />
    </header>
  );
}
