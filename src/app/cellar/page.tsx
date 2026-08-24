import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { NewEntryButton } from "@/features/cellar/new-entry-button";
import { getCellarEntries, getCellarStats } from "@/features/cellar/queries";
import { formatDate, formatKRW, joinDot } from "@/lib/format";
import { wineDisplayName, wineTypeLabel } from "@/lib/wine";

export const metadata: Metadata = {
  title: "셀러",
  description: "내가 마신 와인 기록.",
};

// DB를 요청 시점에 읽는다. 빌드 때 정적 생성(프리렌더)하지 않는다.
export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-rose/15 bg-white/5 px-4 py-3">
      <div className="text-xs text-rose/60">{label}</div>
      <div className="mt-1 font-serif text-2xl text-foreground">{value}</div>
    </div>
  );
}

export default async function CellarPage() {
  const [entries, stats] = await Promise.all([getCellarEntries(), getCellarStats()]);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24">
        <header className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl tracking-tight text-foreground">셀러</h1>
            <p className="mt-2 text-rose/70">그동안 마신 와인 기록.</p>
          </div>
          <div className="mt-2">
            <NewEntryButton />
          </div>
        </header>

        {/* 통계 */}
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="총 병 수" value={`${stats.total}병`} />
          <StatCard label="마신 와인" value={`${stats.uniqueWines}종`} />
          <StatCard
            label="평균 구매가"
            value={stats.avgPrice != null ? formatKRW(stats.avgPrice) : "—"}
          />
          <StatCard label="재구매" value={`${stats.repurchased}종`} />
        </section>

        {/* 종류·국가 분포 */}
        <section className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <DistRow
            label="종류"
            items={stats.byType.map((t) => ({ ...t, label: wineTypeLabel(t.label) }))}
          />
          <DistRow label="국가" items={stats.byCountry} />
        </section>

        {/* 타임라인 */}
        <section className="mt-10">
          <ol className="flex flex-col">
            {entries.map((e) => {
              const name = wineDisplayName(e.wine);
              const country = e.wine.region?.country ?? e.wine.region?.parent?.nameKo ?? null;
              const meta = joinDot(
                wineTypeLabel(e.wine.type),
                country,
                e.wine.abv != null ? `${e.wine.abv}%` : null,
                e.vintageYear ? `${e.vintageYear} 빈티지` : null
              );
              return (
                <li key={e.id} className="border-t border-rose/10 first:border-t-0">
                  <Link
                    href={`/cellar/${e.id}`}
                    className="group flex flex-col gap-1 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <time className="w-24 shrink-0 font-mono text-sm text-gold/80">
                      {formatDate(e.drankOn)}
                    </time>
                    <div className="min-w-0 flex-1">
                      <div className="font-serif text-lg text-foreground group-hover:text-rose">
                        {name.primary}
                      </div>
                      {name.alias ? <div className="text-xs text-rose/40">{name.alias}</div> : null}
                      <div className="mt-0.5 text-sm text-rose/60">{meta}</div>
                      {e.bodyText ? (
                        <p className="mt-1 line-clamp-1 text-sm text-muted">{e.bodyText}</p>
                      ) : null}
                    </div>
                    {e.purchasePrice != null ? (
                      <div className="shrink-0 text-sm text-rose/70">
                        {formatKRW(e.purchasePrice)}
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>

          {entries.length === 0 ? (
            <p className="py-16 text-center text-muted">아직 기록이 없습니다.</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function DistRow({ label, items }: { label: string; items: { label: string; count: number }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-rose/50">{label}</span>
      <span className="text-rose/80">
        {items.map((it) => `${it.label} ${it.count}`).join(" · ")}
      </span>
    </div>
  );
}
