// "나와 이 산지의 관계" — 이 산지 와인을 얼마나 마셨는지 시음 기록에서 집계해 보여준다.
// 개인 와인 사이트라 산지 페이지에 개인적 레이어를 더한다. 기록이 없으면 아무것도 안 그린다.

import { formatKRW } from "@/lib/format";
import type { RegionStats } from "./collection-queries";

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-serif text-xl leading-none text-foreground">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

export function RegionMyStats({ stats }: { stats: RegionStats }) {
  if (stats.tastings === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">내 기록</h2>
      <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
        <Stat value={`${stats.tastings}회`} label="마신 기록" />
        <Stat value={`${stats.winesTasted}종`} label="마셔본 와인" />
        {stats.avgRating != null ? (
          <Stat
            value={
              <span className="text-gold">
                ★ {stats.avgRating.toFixed(1)}
                <span className="ml-0.5 text-xs text-muted">/5</span>
              </span>
            }
            label="평균 별점"
          />
        ) : null}
        {stats.avgPrice != null ? (
          <Stat value={formatKRW(Math.round(stats.avgPrice))} label="평균 구매가" />
        ) : null}
      </div>
    </section>
  );
}
