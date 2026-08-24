import Link from "next/link";
import { AdminBadge } from "@/features/admin/admin-badge";

const NAV = [
  { href: "/explore", label: "탐험" },
  { href: "/cellar", label: "기록" },
  { href: "/learn", label: "학습" },
];

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
      <Link href="/" className="font-serif text-lg tracking-tight text-foreground">
        wine<span className="text-gold">.</span>byb.kr
      </Link>
      <nav className="flex items-center gap-6 text-sm text-rose/70">
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
    </header>
  );
}
