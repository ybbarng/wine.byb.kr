// 비슷한 산지 — 주력 품종이 겹치는 내 DB 산지로 잇는다. 겹치는 품종을 이유로 곁들인다.
// 후보가 없으면(겹치는 품종이 없거나 다른 산지가 없으면) 아무것도 안 그린다.

import Link from "next/link";
import type { SimilarRegion } from "./collection-queries";

export function SimilarRegions({ regions }: { regions: SimilarRegion[] }) {
  if (regions.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">비슷한 산지</h2>
      <div className="flex flex-col gap-2">
        {regions.map((r) => (
          <Link
            key={r.slug}
            href={`/region/${r.slug}`}
            className="flex items-baseline justify-between gap-3 rounded-lg border border-foreground/12 px-3 py-2 transition-colors hover:border-foreground/25 hover:bg-foreground/5"
          >
            <span className="truncate text-sm text-foreground">{r.nameKo}</span>
            <span className="shrink-0 text-xs text-muted">{r.shared.join(" · ")}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
