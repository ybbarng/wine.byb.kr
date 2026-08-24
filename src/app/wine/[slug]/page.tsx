import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getWineBySlug } from "@/features/wine/queries";
import { RegionMap } from "@/features/wine/region-map";
import { formatDate, formatKRW, joinDot } from "@/lib/format";
import { wineDisplayName, wineTypeLabel } from "@/lib/wine";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/wine/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getWineBySlug(slug);
  if (!data) return { title: "와인을 찾을 수 없음" };
  return { title: wineDisplayName(data.wine).primary };
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-wine/40 px-2 py-1 text-xs text-rose/80">{children}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-lg text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function WineDetailPage({ params }: PageProps<"/wine/[slug]">) {
  const { slug } = await params;
  const data = await getWineBySlug(slug);
  if (!data) notFound();

  const { wine, similar } = data;
  const name = wineDisplayName(wine);
  const country = wine.region?.country ?? wine.region?.parent?.nameKo ?? null;

  // fly-to 목표: 지역 좌표가 있으면 그걸, 없으면 국가(부모) 좌표를 쓴다.
  const region = wine.region;
  const target =
    region?.latitude != null && region?.longitude != null
      ? { lat: region.latitude, lng: region.longitude }
      : region?.parent?.latitude != null && region?.parent?.longitude != null
        ? { lat: region.parent.latitude, lng: region.parent.longitude }
        : null;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24">
        {/* 히어로 */}
        <header className="mt-8">
          <h1 className="font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
            {name.primary}
          </h1>
          {name.alias ? <p className="mt-1 text-rose/50">{name.alias}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>{wineTypeLabel(wine.type)}</Badge>
            {wine.abv != null ? <Badge>{wine.abv}%</Badge> : null}
            {wine.classification ? <Badge>{wine.classification}</Badge> : null}
          </div>
          <p className="mt-3 text-sm text-rose/70">
            {joinDot(wine.producer?.nameKo, wine.region?.nameKo, country) || "정보 준비 중"}
          </p>
        </header>

        {/* 산지 지도 — 진입 시 해당 산지로 날아간다 */}
        {target ? (
          <div className="mt-8">
            <RegionMap lat={target.lat} lng={target.lng} label={country ?? name.primary} />
          </div>
        ) : null}

        {/* 품종 */}
        {wine.grapes.length > 0 ? (
          <Section title="품종">
            <ul className="flex flex-col gap-2">
              {wine.grapes.map((g) => (
                <li key={g.id} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-foreground">{g.grape.nameKo}</span>
                  {g.percent != null ? (
                    <div className="flex flex-1 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-wine-bright"
                          style={{ width: `${g.percent}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-rose/60">{g.percent}%</span>
                    </div>
                  ) : (
                    <span className="text-rose/40">비율 미상</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        ) : wine.blendRaw ? (
          <Section title="품종">
            <p className="text-sm text-rose/70">{wine.blendRaw}</p>
          </Section>
        ) : null}

        {/* 지역 & 생산자 */}
        {wine.region || wine.producer ? (
          <Section title="지역 & 생산자">
            <dl className="flex flex-col gap-2 text-sm">
              {wine.region ? (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-rose/50">지역</dt>
                  <dd className="text-foreground">{joinDot(wine.region.nameKo, country)}</dd>
                </div>
              ) : null}
              {wine.producer ? (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-rose/50">생산자</dt>
                  <dd className="text-foreground">
                    {joinDot(wine.producer.nameKo, wine.producer.nameLocal)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Section>
        ) : null}

        {/* 시음 포인트 */}
        {wine.notesKo ? (
          <Section title="시음 포인트">
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {wine.notesKo}
            </p>
          </Section>
        ) : null}

        {/* 내 기록 */}
        <Section title="내 기록">
          {wine.tastingNotes.length > 0 ? (
            <ul className="flex flex-col">
              {wine.tastingNotes.map((n) => (
                <li key={n.id} className="border-t border-rose/10 first:border-t-0">
                  <Link
                    href={`/cellar/${n.id}`}
                    className="flex items-baseline justify-between gap-3 py-2.5 text-sm text-rose/70 hover:text-foreground"
                  >
                    <span className="font-mono text-gold/70">{formatDate(n.drankOn)}</span>
                    <span className="min-w-0 flex-1 truncate text-rose/50">{n.bodyText ?? ""}</span>
                    <span className="shrink-0">{formatKRW(n.purchasePrice)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">아직 안 마심.</p>
          )}
        </Section>

        {/* 유사 추천 */}
        {similar.length > 0 ? (
          <Section title="비슷한 와인">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {similar.map((w) => {
                const sName = wineDisplayName(w);
                const sCountry = w.region?.country ?? w.region?.parent?.nameKo ?? null;
                return (
                  <li key={w.id}>
                    <Link
                      href={`/wine/${w.slug}`}
                      className="flex flex-col rounded-lg border border-rose/10 px-3 py-2 transition-colors hover:border-rose/30 hover:bg-white/[0.03]"
                    >
                      <span className="truncate text-sm text-foreground">{sName.primary}</span>
                      <span className="mt-0.5 truncate text-xs text-rose/50">
                        {joinDot(wineTypeLabel(w.type), sCountry)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}
      </main>
    </div>
  );
}
