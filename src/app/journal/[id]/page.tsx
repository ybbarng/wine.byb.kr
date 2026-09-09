import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { NoteActions } from "@/features/journal/note-actions";
import { getTastingNote } from "@/features/journal/queries";
import { parseAromas, parseFlavor, toDateInput } from "@/features/journal/tasting-note-schema";
import { PriceBadge } from "@/features/wine/price-badge";
import { RegionHierarchy } from "@/features/wine/region-hierarchy";
import {
  expectedAromaGroups,
  expectedFlavorFor,
  FLAVOR_AXES,
  flavorLevelWord,
} from "@/features/wine/tasting-hints";
import { wineGlassFor } from "@/features/wine/wine-glass";
import { WineInfoSections } from "@/features/wine/wine-info-sections";
import { priceVerdict, winePrice } from "@/features/wine/wine-price-info";
import { formatDate, formatKRW } from "@/lib/format";
import { WINE_TYPE_LABELS, wineDisplayName, wineTypeLabel } from "@/lib/wine";

// DB를 요청 시점에 읽는다. 빌드 때 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/journal/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getTastingNote(id);
  if (!data) return { title: "기록을 찾을 수 없음" };
  return { title: `${wineDisplayName(data.note.wine).primary} 시음 기록` };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function InfoChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm text-foreground/90">{children}</span>
    </span>
  );
}

export default async function TastingNotePage({ params }: PageProps<"/journal/[id]">) {
  const { id } = await params;
  const data = await getTastingNote(id);
  if (!data) notFound();

  const { note, others } = data;
  const { wine } = note;
  const name = wineDisplayName(wine);
  const region = wine.region;
  const country = region?.country ?? region?.parent?.nameKo ?? null;
  const target =
    region?.latitude != null && region?.longitude != null
      ? { lat: region.latitude, lng: region.longitude }
      : region?.parent?.latitude != null && region?.parent?.longitude != null
        ? { lat: region.parent.latitude, lng: region.parent.longitude }
        : null;

  // 잔 색: 이 기록에서 관찰한 색 → 와인 고정색 → 추정.
  const grapeNames = wine.grapes.map((g) => g.grape.nameKo);
  const aromas = parseAromas(note.aromasConfirmed); // 가이드 향 단계에서 맡은 향
  const flavor = parseFlavor(note.flavorFelt); // 가이드 맛 단계에서 느낀 정도(1~5)
  const feltAxes = FLAVOR_AXES.filter(({ key }) => flavor[key] != null);
  // 기록할 때 곁들였던 "예상"을 다시 볼 때도 함께 보여준다. 예상만 보고 끝나면
  // 배움이 반만 남는다 — 무엇을 예상했고 실제로 어땠는지가 나란히 있어야 다음에 쓴다.
  // 예상은 기록한 항목 옆에만 붙인다(이 페이지는 안내가 아니라 기록이므로).
  const expectedFlavor = expectedFlavorFor(grapeNames, {
    type: wine.type,
    label: [wine.nameLocal, wine.nameKo, wine.classification],
  });
  const expectedAromas = expectedAromaGroups({
    grapes: grapeNames,
    type: wine.type,
    vintageYear: note.vintageYear,
    drankOn: toDateInput(note.drankOn),
    oakAging: wine.oakAging,
  }).flatMap((g) => g.aromas);
  // 예상했는데 고르지 않은 향 — "다음엔 이걸 찾아보자"가 된다.
  const missedAromas = expectedAromas.filter((a) => !aromas.includes(a));
  const displayColor = note.colorHex ?? wine.colorHex ?? undefined;
  const { absorb, glass } = wineGlassFor(wine.type, grapeNames, wine.slug, displayColor);
  const fair = winePrice(wine.slug);

  // 이름 아래 "생산자 · 지역 · 국가" — 생산자·지역은 각 페이지로 링크. 지역명이 국가와
  // 같으면(예: 산지도 국가도 "호주") 국가는 생략해 중복을 없앤다.
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
  }
  if (country && country !== region?.nameKo) identity.push(country);

  return (
    <WineDetailView
      absorb={absorb}
      glass={glass}
      abv={wine.abv}
      country={country}
      regionName={region?.nameKo ?? null}
      fallback={target}
      label={country ?? name.primary}
      leadWithDetail
      belowMap={
        country || region ? (
          <div>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">산지 계층</h2>
            <RegionHierarchy
              country={country}
              regionName={region?.nameKo ?? null}
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
      {/* 상단: 뒤로 · 수정 */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/journal" className="text-sm text-muted hover:text-foreground">
          ← 마신 기록
        </Link>
        <NoteActions id={note.id} />
      </div>

      {/* A2: 이 페이지가 '시음 기록'임을 명시해 와인 페이지와 구분 */}
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gold">시음 기록</p>
      {/* A1: 기록이 주인공 — 마신 날짜를 제목으로 */}
      <h1 className="mt-0.5 font-serif text-2xl leading-tight text-foreground">
        {formatDate(note.drankOn)} 시음 노트
      </h1>
      {/* 어떤 와인의 기록인지 — 부제 */}
      <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
        {/* 실제 관찰/추정 색을 점으로(고정 붉은색이 아니라). 화이트인데 붉은 점 뜨던 문제 해결. */}
        <span
          className={`h-3 w-3 rounded-full border border-foreground/20 ${displayColor ? "" : "bg-wine"}`}
          style={displayColor ? { background: displayColor } : undefined}
        />
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
        {note.vintageYear ? <span>· {note.vintageYear} 빈티지</span> : null}
        {wine.abv != null ? <span>· {wine.abv}%</span> : null}
      </div>
      <p className="mt-1 font-serif text-lg leading-tight text-foreground/90">{name.primary}</p>
      {name.alias ? <p className="text-sm text-muted">{name.alias}</p> : null}
      <p className="mt-1 text-sm text-foreground/80">
        {identity.map((part, i) => (
          <span key={i}>
            {i > 0 ? " · " : ""}
            {part}
          </span>
        ))}
      </p>

      {/* 이 기록 — 골드 카드(날짜는 제목으로 올렸으니 별점부터) */}
      <section className="mt-4 rounded-2xl border border-gold/25 bg-gold/[0.06] p-4 shadow-sm shadow-gold/5">
        {note.rating ? (
          <div className="text-xl text-gold">
            {"★".repeat(note.rating)}
            <span className="text-muted/25">{"★".repeat(5 - note.rating)}</span>
          </div>
        ) : null}
        <dl className="mt-2">
          {note.purchasedOn ? (
            <div className="flex gap-3 border-t border-foreground/10 py-2 text-sm first:border-t-0">
              <dt className="w-20 shrink-0 text-muted">구매일</dt>
              <dd className="text-foreground">{formatDate(note.purchasedOn)}</dd>
            </div>
          ) : null}
          {note.purchasePrice != null ? (
            <div className="flex items-center gap-3 border-t border-foreground/10 py-2 text-sm first:border-t-0">
              <dt className="w-20 shrink-0 text-muted">구매가격</dt>
              <dd className="flex items-center gap-2 text-foreground">
                {formatKRW(note.purchasePrice)}
                {fair ? <PriceBadge v={priceVerdict(note.purchasePrice, fair)} /> : null}
              </dd>
            </div>
          ) : null}
        </dl>
        {note.repurchase || note.value || note.colorHex ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {note.colorHex ? (
              <InfoChip label="색">
                {/* 옅은 색(near-white)도 보이게 큰 스와치 + hex. 작은 점은 크림 배경에 묻혔음. */}
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-5 w-8 rounded border border-foreground/25 shadow-inner shadow-foreground/15"
                    style={{ background: note.colorHex }}
                  />
                  <span className="font-mono text-xs text-muted">{note.colorHex}</span>
                </span>
              </InfoChip>
            ) : null}
            {note.repurchase ? <InfoChip label="다시 살까">{note.repurchase}</InfoChip> : null}
            {note.value ? <InfoChip label="가격 대비">{note.value}</InfoChip> : null}
          </div>
        ) : null}
        {aromas.length > 0 ? (
          <div className="mt-3">
            <span className="text-[10px] uppercase tracking-wide text-muted">맡은 향</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {aromas.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-gold/30 bg-gold/[0.08] px-2.5 py-1 text-xs text-foreground/85"
                >
                  {a}
                </span>
              ))}
            </div>
            {/* 예상했는데 못 맡은 향 — 다음에 같은 와인을 열 때 찾아볼 거리가 된다. */}
            {missedAromas.length > 0 ? (
              <p className="mt-1.5 text-xs leading-snug text-muted/70">
                예상했지만 고르지 않음 — {missedAromas.join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
        {feltAxes.length > 0 ? (
          <div className="mt-3">
            <span className="text-[10px] uppercase tracking-wide text-muted">느낀 맛</span>
            {/* 좁은 화면에서 한 줄에 다 안 들어가므로 위저드 맛 단계와 같은 배치로 쌓는다:
                윗줄에 축 이름과 예상, 아랫줄에 실제로 느낀 정도. */}
            <div className="mt-1.5 flex flex-col gap-2">
              {feltAxes.map(({ key, label }) => {
                const level = flavor[key] ?? 0;
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-muted">{label}</span>
                      {/* 기록할 때 곁들였던 예상 — 맞았는지 틀렸는지는 매기지 않는다. */}
                      {expectedFlavor[key] ? (
                        <span className="text-xs text-gold/80">예상 {expectedFlavor[key]}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2.5">
                      <span className="flex gap-1" aria-hidden>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            className={`h-1.5 w-5 rounded-full ${
                              n <= level ? "bg-gold" : "bg-foreground/12"
                            }`}
                          />
                        ))}
                      </span>
                      <span className="text-xs text-muted/80">
                        {level}/5 · {flavorLevelWord(key, level)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {note.bodyText ? (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {note.bodyText}
          </p>
        ) : null}
      </section>

      {/* 와인 보편 정보 — 와인 페이지와 공용 */}
      <WineInfoSections wine={wine} />

      {/* 이 와인을 마신 다른 기록 */}
      {others.length > 0 ? (
        <Section title={`이 와인을 마신 다른 기록 ${others.length}건`}>
          <ul className="flex flex-col">
            {others.map((o) => (
              <li key={o.id} className="border-t border-foreground/10 first:border-t-0">
                <Link
                  href={`/journal/${o.id}`}
                  className="flex items-baseline justify-between gap-3 py-2 text-sm text-foreground/75 hover:text-foreground"
                >
                  <span className="font-mono text-xs text-gold">{formatDate(o.drankOn)}</span>
                  {fair && o.purchasePrice != null ? (
                    <PriceBadge v={priceVerdict(o.purchasePrice, fair)} />
                  ) : null}
                  <span className="shrink-0">{formatKRW(o.purchasePrice)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </WineDetailView>
  );
}
