import Link from "next/link";
import { WineMark } from "./WineMark";

// 사이트 로고(와인잔 심볼 + wine 워드마크). 모든 헤더가 공유하는 단일 브랜딩.
export function BrandLogo() {
  return (
    <Link href="/" aria-label="wine.byb.kr 홈" className="group flex shrink-0 items-center gap-2">
      <WineMark className="h-6 w-6 text-wine transition-colors group-hover:text-wine-bright" />
      <span className="-translate-y-[2px] font-logo text-[1.7rem] font-semibold lowercase leading-none tracking-tight text-foreground">
        wine
      </span>
    </Link>
  );
}
