import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { WineList } from "@/components/WineList";
import { PriceBadge } from "@/features/wine/price-badge";
import { getWineBySlug } from "@/features/wine/queries";
import { RegionHierarchy } from "@/features/wine/region-hierarchy";
import { averageHex, wineGlassFor } from "@/features/wine/wine-glass";
import { WineInfoSections } from "@/features/wine/wine-info-sections";
import { priceVerdict, winePrice } from "@/features/wine/wine-price-info";
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
  // 잔 색: 수동 고정(wine.colorHex) → 시음 기록 색들의 평균 → 추정.
  const displayColor =
    wine.colorHex ?? averageHex(wine.tastingNotes.map((n) => n.colorHex)) ?? undefined;
  const { absorb, glass } = wineGlassFor(wine.type, grapeNames, wine.slug, displayColor);
  const fair = winePrice(wine.slug); // 국내 소매 적정가 범위(내 기록 판정용)

  // 이름 아래 "생산자 · 지역 · 국가" 줄. 생산자·지역은 각 페이지로 잇는다. 지역명이
  // 국가와 같으면(예: 산지도 국가도 "호주") 국가는 생략해 중복을 없앤다.
  const identity: React.ReactNode[] = [];
  if (wine.producer?.nameKo) {
    identity.push(
      wine.producer.slug ? (
        <Link
          key="producer"
          href={`/producer/${wine.producer.slug}`}
          className="underline decoration-foreground/25 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
        >
          {wine.producer.nameKo}
        </Link>
      ) : (
        wine.producer.nameKo
      )
    );
  }
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
  if (country && country !== region?.nameKo) identity.push(country);

  return (
    <WineDetailView
      variant="shell"
      absorb={absorb}
      glass={glass}
      abv={wine.abv}
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
      {/* A2: 이 페이지가 '와인'임을 명시(시음 기록 페이지와 구분) */}
      <p className="text-xs font-medium uppercase tracking-wide text-muted">와인</p>
      {/* 헤더: 이름·타입 */}
      <div className="mt-0.5 flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
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

      {/* 와인 보편 정보(프로필·떼루아·품종·페어링·생산자·적정가) — 시음 기록과 공용 */}
      <WineInfoSections wine={wine} />

      {/* 내 기록 */}
      <Section title="내 기록">
        {wine.tastingNotes.length > 0 ? (
          <ul className="flex flex-col">
            {wine.tastingNotes.map((n) => (
              <li key={n.id} className="border-t border-foreground/10 first:border-t-0">
                <Link
                  href={`/journal/${n.id}`}
                  className="flex items-baseline justify-between gap-2.5 py-2 text-sm text-foreground/75 hover:text-foreground"
                >
                  <span className="font-mono text-xs text-gold">{formatDate(n.drankOn)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{n.bodyText ?? ""}</span>
                  {fair && n.purchasePrice != null ? (
                    <PriceBadge v={priceVerdict(n.purchasePrice, fair)} />
                  ) : null}
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
