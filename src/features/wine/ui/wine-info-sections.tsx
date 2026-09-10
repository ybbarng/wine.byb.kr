import Link from "next/link";
import { grapeInfo, pairingsForGrapes } from "@/features/wine/curation/grape-info";
import { producerInfo } from "@/features/wine/curation/producer-info";
import { regionInfo } from "@/features/wine/curation/region-info";
import { winePrice } from "@/features/wine/curation/wine-price-info";
import { GrapeColorDot } from "@/features/wine/ui/grape-color";
import { wineProfile } from "@/features/wine/wine-profile";
import { formatKRW } from "@/lib/format";

// 와인 상세와 시음 기록이 함께 쓰는 "와인 보편 정보" 섹션 묶음:
// 종합 프로필 · 떼루아 · 품종 · 시음 포인트 · 페어링 · 생산자 · 국내 적정가.
// 기록(별점·구매가 등)은 각 페이지가 이 위에 따로 얹는다.

type WineForInfo = {
  slug: string;
  nameKo: string;
  nameLocal: string | null;
  type: string | null;
  classification: string | null;
  blendRaw: string | null;
  notesKo: string | null;
  grapes: { id: string; percent: number | null; grape: { slug: string; nameKo: string } }[];
  region: { nameKo: string } | null;
  producer: { nameKo: string; nameLocal: string | null; slug: string } | null;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function ProfileChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm text-foreground/90">{value}</span>
    </span>
  );
}

export function WineInfoSections({ wine }: { wine: WineForInfo }) {
  const grapeNames = wine.grapes.map((g) => g.grape.nameKo);
  const primaryGrape = grapeNames[0] ?? null;
  const gInfo = grapeInfo(primaryGrape);
  const rInfo = regionInfo(wine.region?.nameKo);
  const profile = wineProfile(wine, gInfo, primaryGrape);
  const pInfo = producerInfo(wine.producer?.nameKo ?? wine.producer?.nameLocal ?? null);
  const pairings = pairingsForGrapes(grapeNames);
  const fair = winePrice(wine.slug);
  const terroir = [rInfo?.climate, rInfo?.soil].filter(Boolean).join(" · ");
  const grapeStats = [
    gInfo?.body && `바디 ${gInfo.body}`,
    gInfo?.acidity && `산도 ${gInfo.acidity}`,
    gInfo?.tannin && `타닌 ${gInfo.tannin}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* 이 와인, 어떨까 — 한눈에 + 떼루아·품종의 이유 */}
      <Section title="이 와인, 어떨까">
        <div className="flex flex-wrap gap-1.5">
          <ProfileChip label="색" value={profile.color} />
          {profile.body ? <ProfileChip label="바디" value={profile.body} /> : null}
          <ProfileChip label="당도" value={profile.sweetness} />
          <ProfileChip label="온도" value={profile.servingTemp} />
          {profile.tier ? <ProfileChip label="수준" value={profile.tier} /> : null}
        </div>
        {rInfo || gInfo ? (
          <dl className="mt-3 flex flex-col gap-2 text-sm leading-relaxed">
            {rInfo ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">
                  떼루아{terroir ? ` · ${terroir}` : ""}
                </dt>
                <dd className="text-foreground/85">{rInfo.desc}</dd>
              </div>
            ) : null}
            {gInfo && primaryGrape ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">
                  {primaryGrape}
                  {grapeStats ? ` · ${grapeStats}` : ""}
                </dt>
                <dd className="text-foreground/85">{gInfo.desc}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Section>

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

      {/* 생산자 */}
      {pInfo || wine.producer ? (
        <Section title="생산자">
          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-foreground">{wine.producer?.nameKo ?? "—"}</span>
              {wine.producer?.slug ? (
                <Link
                  href={`/producer/${wine.producer.slug}`}
                  className="shrink-0 text-xs text-gold underline decoration-transparent underline-offset-2 transition-colors hover:decoration-gold/50"
                >
                  생산자 페이지 →
                </Link>
              ) : null}
            </div>
            {pInfo ? <p className="mt-1 text-xs leading-relaxed text-muted">{pInfo.desc}</p> : null}
          </div>
        </Section>
      ) : null}

      {/* 국내 적정가 */}
      {fair ? (
        <Section title="국내 적정가">
          <p className="text-sm text-foreground/90">
            {formatKRW(fair.low)} ~ {formatKRW(fair.high)}
            <span className="ml-1.5 text-xs text-muted">와인샵·마트 소매 기준 · 추정</span>
          </p>
          {fair.note ? <p className="mt-1 text-xs text-muted">{fair.note}</p> : null}
        </Section>
      ) : null}
    </>
  );
}
