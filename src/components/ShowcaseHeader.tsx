"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./BrandLogo";

type SearchResult = {
  kind: "region" | "grape" | "wine";
  href: string;
  name: string;
  sub: string;
};

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  region: "산지",
  grape: "품종",
  wine: "와인",
};

// 홈·와인 상세·검색 결과 페이지가 공유하는 상단 헤더.
// 로고(와인잔 심볼 + wine) · 통합 검색(→ /wine/[slug]) · 내비.
// hairline: 하단 와인톤 가로선. 홈처럼 내용이 바로 이어질 땐 켜고, 카드가 떠 있는
// 세부 페이지에선 카드 테두리와 겹쳐 어색하므로 끈다.
export function ShowcaseHeader({ hairline = true }: { hairline?: boolean } = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  // 입력 디바운스 후 서버 검색.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  // 바깥 클릭 시 드롭다운 닫기.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setResults([]);
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  const go = (href: string) => {
    setQuery("");
    setResults([]);
    router.push(href);
  };

  return (
    <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 px-6 py-3">
      <BrandLogo />

      <div ref={boxRef} className="relative w-full max-w-md">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-foreground/55"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.2-4.2" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색하기"
          className="w-full rounded-full border border-foreground/15 bg-card/70 py-2.5 pl-11 pr-5 text-sm text-foreground shadow-sm backdrop-blur placeholder:text-muted focus:border-foreground/40 focus:outline-none"
        />
        {results.length > 0 && (
          <ul className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl border border-foreground/10 bg-card/95 p-1 shadow-lg shadow-foreground/10 backdrop-blur">
            {results.map((r) => (
              <li key={`${r.kind}:${r.href}`}>
                <button
                  type="button"
                  onClick={() => go(r.href)}
                  className="flex w-full items-baseline gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-foreground/8"
                >
                  <span className="w-8 shrink-0 text-[11px] text-gold">{KIND_LABEL[r.kind]}</span>
                  <span className="truncate">{r.name}</span>
                  {r.sub ? <span className="shrink-0 truncate text-muted">· {r.sub}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav className="hidden shrink-0 items-center gap-5 text-sm text-muted sm:flex">
        <Link href="/explore" className="transition-colors hover:text-foreground">
          탐험
        </Link>
        <Link href="/catalog" className="transition-colors hover:text-foreground">
          도감
        </Link>
        <Link href="/journal" className="transition-colors hover:text-foreground">
          기록
        </Link>
        <Link href="/learn" className="transition-colors hover:text-foreground">
          학습
        </Link>
      </nav>

      {hairline ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(110,26,51,0.15) 25%, rgba(110,26,51,0.15) 75%, transparent)",
          }}
        />
      ) : null}
    </header>
  );
}
