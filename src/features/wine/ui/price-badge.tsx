import type { PriceVerdict } from "@/features/wine/curation/wine-price-info";

const VERDICT_CLASS: Record<PriceVerdict["tone"], string> = {
  gold: "border-gold/25 bg-gold/10 text-gold",
  muted: "border-foreground/12 bg-foreground/5 text-muted",
  wine: "border-wine/25 bg-wine/10 text-wine",
};

// 실구매가가 국내 적정가 대비 어땠는지 배지(잘 샀어요/적정/비싸게). 와인 상세와
// 시음 기록에서 공용.
export function PriceBadge({ v }: { v: PriceVerdict }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${VERDICT_CLASS[v.tone]}`}
    >
      {v.label}
    </span>
  );
}
