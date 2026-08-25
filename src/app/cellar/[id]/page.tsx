import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { NoteActions } from "@/features/cellar/note-actions";
import { getTastingNote } from "@/features/cellar/queries";
import { formatDate, formatKRW, joinDot } from "@/lib/format";
import { wineDisplayName, wineTypeLabel } from "@/lib/wine";

// DB를 요청 시점에 읽는다. 빌드 때 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/cellar/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getTastingNote(id);
  if (!data) return { title: "기록을 찾을 수 없음" };
  return { title: `${wineDisplayName(data.note.wine).primary} 시음 기록` };
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-wine/40 px-2 py-1 text-xs text-muted/80">{children}</span>;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 border-t border-foreground/10 py-2.5 text-sm first:border-t-0">
      <dt className="w-20 shrink-0 text-muted/50">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

export default async function TastingNotePage({ params }: PageProps<"/cellar/[id]">) {
  const { id } = await params;
  const data = await getTastingNote(id);
  if (!data) notFound();

  const { note, others } = data;
  const { wine } = note;
  const name = wineDisplayName(wine);
  const country = wine.region?.country ?? wine.region?.parent?.nameKo ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24">
        <div className="mt-6 flex items-center justify-between gap-4">
          <Link href="/cellar" className="text-sm text-muted/60 hover:text-foreground">
            ← 셀러
          </Link>
          <NoteActions id={note.id} />
        </div>

        {/* 와인 히어로 */}
        <header className="mt-4">
          <h1 className="font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
            {name.primary}
          </h1>
          {name.alias ? <p className="mt-1 text-muted/50">{name.alias}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>{wineTypeLabel(wine.type)}</Badge>
            {note.vintageYear ? <Badge>{note.vintageYear} 빈티지</Badge> : null}
            {wine.abv != null ? <Badge>{wine.abv}%</Badge> : null}
          </div>
          <p className="mt-3 text-sm text-muted/70">
            {joinDot(wine.producer?.nameKo, wine.region?.nameKo, country)}
          </p>
          <Link
            href={`/wine/${wine.slug}`}
            className="mt-2 inline-block text-sm text-gold/80 hover:text-gold"
          >
            이 와인 페이지 →
          </Link>
        </header>

        {/* 품종 */}
        {wine.grapes.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-serif text-lg text-foreground">품종</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {wine.grapes.map((g) => (
                <li key={g.id} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-foreground">{g.grape.nameKo}</span>
                  {g.percent != null ? (
                    <div className="flex flex-1 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card/60">
                        <div
                          className="h-full rounded-full bg-wine-bright"
                          style={{ width: `${g.percent}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-muted/60">{g.percent}%</span>
                    </div>
                  ) : (
                    <span className="text-muted/40">비율 미상</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 시음 내용 */}
        <section className="mt-8">
          <h2 className="font-serif text-lg text-foreground">이 기록</h2>
          <dl className="mt-3">
            <DetailRow label="음용일" value={formatDate(note.drankOn)} />
            <DetailRow label="구매일" value={formatDate(note.purchasedOn)} />
            <DetailRow label="구매가격" value={formatKRW(note.purchasePrice) || null} />
            <DetailRow label="등급" value={wine.classification} />
          </dl>
          {note.bodyText ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {note.bodyText}
            </p>
          ) : null}
        </section>

        {/* 재음용 — 같은 와인의 다른 기록 */}
        {others.length > 0 ? (
          <section className="mt-8 rounded-xl border border-gold/20 bg-gold/5 px-4 py-4">
            <h2 className="text-sm text-gold">이 와인을 마신 다른 기록 {others.length}건</h2>
            <ul className="mt-2 flex flex-col">
              {others.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/cellar/${o.id}`}
                    className="flex items-baseline justify-between gap-3 py-1.5 text-sm text-muted/70 hover:text-foreground"
                  >
                    <span className="font-mono text-gold/70">{formatDate(o.drankOn)}</span>
                    <span>{formatKRW(o.purchasePrice)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
