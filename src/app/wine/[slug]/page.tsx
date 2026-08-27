import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { WineList } from "@/components/WineList";
import { GrapeColorDot } from "@/features/wine/grape-color";
import { pairingsForGrapes } from "@/features/wine/grape-info";
import { getWineBySlug } from "@/features/wine/queries";
import { RegionHierarchy } from "@/features/wine/region-hierarchy";
import { wineGlassFor } from "@/features/wine/wine-glass";
import { formatDate, formatKRW } from "@/lib/format";
import { WINE_TYPE_LABELS, wineDisplayName, wineTypeLabel } from "@/lib/wine";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/wine/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getWineBySlug(slug);
  if (!data) return { title: "와인을 찾을 수 없음" };
  return { title: wineDisplayName(data.wine).primary };
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-foreground/12 bg-foreground/5 px-2.5 py-1 text-xs text-foreground/80">
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</h2>
      {children}
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
  const region = wine.region;
  const target =
    region?.latitude != null && region?.longitude != null
      ? { lat: region.latitude, lng: region.longitude }
      : region?.parent?.latitude != null && region?.parent?.longitude != null
        ? { lat: region.parent.latitude, lng: region.parent.longitude }
        : null;

  const grapeNames = wine.grapes.map((g) => g.grape.nameKo);
  const { absorb, glass } = wineGlassFor(wine.type, grapeNames, wine.slug);
  // 이 와인의 품종에서 음식 페어링을 모은다(무엇과·왜).
  const pairings = pairingsForGrapes(grapeNames);

  // 이름 아래 "생산자 · 지역 · 국가" 줄. 지역은 지역 페이지로 잇는다.
  const identity: React.ReactNode[] = [];
  if (wine.producer?.nameKo) identity.push(wine.producer.nameKo);
  if (region) {
    identity.push(
      <Link
        key="region"
        href={`/region/${region.slug}`}
        className="underline decoration-foreground/25 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
      >
        {region.nameKo}
      </Link>
    );
  } else if (wine.region?.nameKo) {
    identity.push(wine.region.nameKo);
  }
  if (country) identity.push(country);

  return (
    <WineDetailView
      absorb={absorb}
      glass={glass}
      country={country}
      regionName={wine.region?.nameKo ?? null}
      fallback={target}
      label={country ?? name.primary}
      belowMap={
        country || wine.region ? (
          <div>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">산지 계층</h2>
            <RegionHierarchy
              country={country}
              regionName={wine.region?.nameKo ?? null}
              regionHref={region ? `/region/${region.slug}` : null}
              countryHref={
                region?.parent && region.parent.nameKo === country
                  ? `/region/${region.parent.slug}`
                  : null
              }
            />
          </div>
        ) : null
      }
    >
      {/* 헤더: 이름·타입 */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
        <span className="h-3 w-3 rounded-full border border-foreground/20 bg-wine" />
        {wine.type && WINE_TYPE_LABELS[wine.type] ? (
          <Link
            href={`/type/${wine.type}`}
            className="underline decoration-transparent underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/50"
          >
            {wineTypeLabel(wine.type)}
          </Link>
        ) : (
          wineTypeLabel(wine.type)
        )}
        {wine.abv != null ? <span>· {wine.abv}%</span> : null}
      </div>
      <h1 className="mt-1 font-serif text-2xl leading-tight text-foreground">{name.primary}</h1>
      {name.alias ? <p className="text-sm text-muted">{name.alias}</p> : null}
      <p className="mt-2 text-sm text-foreground/80">
        {identity.length > 0
          ? identity.map((part, i) => (
              <span key={i}>
                {i > 0 ? " · " : ""}
                {part}
              </span>
            ))
          : "정보 준비 중"}
      </p>
      {wine.classification ? (
        <div className="mt-2">
          <Chip>{wine.classification}</Chip>
        </div>
      ) : null}

      {/* 품종 */}
      {wine.grapes.length > 0 ? (
        <Section title="품종">
          <ul className="flex flex-col gap-2">
            {wine.grapes.map((g) => (
              <li key={g.id} className="flex items-center gap-3 text-sm">
                <Link
                  href={`/grape/${g.grape.slug}`}
                  className="flex w-28 shrink-0 items-center gap-1.5 text-foreground underline decoration-transparent underline-offset-2 transition-colors hover:text-wine hover:decoration-wine/50"
                >
                  <GrapeColorDot nameKo={g.grape.nameKo} />
                  {g.grape.nameKo}
                </Link>
                {g.percent != null ? (
                  <div className="flex flex-1 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full bg-wine-bright"
                        style={{ width: `${g.percent}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-muted">{g.percent}%</span>
                  </div>
                ) : (
                  <span className="text-muted">비율 미상</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : wine.blendRaw ? (
        <Section title="품종">
          <p className="text-sm text-foreground/80">{wine.blendRaw}</p>
        </Section>
      ) : null}

      {/* 시음 포인트 */}
      {wine.notesKo ? (
        <Section title="시음 포인트">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
            {wine.notesKo}
          </p>
        </Section>
      ) : null}

      {/* 음식 페어링 — 무엇과, 그리고 왜(품종 특성에서) */}
      {pairings.length > 0 ? (
        <Section title="음식 페어링">
          <ul className="flex flex-col gap-2">
            {pairings.map((p) => (
              <li
                key={p.food}
                className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2"
              >
                <div className="text-sm text-foreground">{p.food}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted">{p.why}</div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 내 기록 */}
      <Section title="내 기록">
        {wine.tastingNotes.length > 0 ? (
          <ul className="flex flex-col">
            {wine.tastingNotes.map((n) => (
              <li key={n.id} className="border-t border-foreground/10 first:border-t-0">
                <Link
                  href={`/journal/${n.id}`}
                  className="flex items-baseline justify-between gap-3 py-2 text-sm text-foreground/75 hover:text-foreground"
                >
                  <span className="font-mono text-xs text-gold">{formatDate(n.drankOn)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{n.bodyText ?? ""}</span>
                  <span className="shrink-0">{formatKRW(n.purchasePrice)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 안 마심.</p>
        )}
      </Section>

      {/* 비슷한 와인 */}
      {similar.length > 0 ? (
        <Section title="비슷한 와인">
          <WineList wines={similar} />
        </Section>
      ) : null}
    </WineDetailView>
  );
}
