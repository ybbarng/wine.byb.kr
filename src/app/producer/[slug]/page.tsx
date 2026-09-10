import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { WineList } from "@/components/WineList";
import { countryFlag } from "@/features/wine/curation/country-names";
import { producerInfo } from "@/features/wine/curation/producer-info";
import { getProducerBySlug } from "@/features/wine/db/collection-queries";
import { wineGlassFor } from "@/features/wine/wine-glass";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/producer/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProducerBySlug(slug);
  return { title: data ? `${data.producer.nameKo} 생산자` : "생산자를 찾을 수 없음" };
}

// 생산자 상세 — 왼쪽 글라스(대표 와인 색)·가운데 지도(생산자 산지)·오른쪽 소개+와인.
export default async function ProducerPage({ params }: PageProps<"/producer/[slug]">) {
  const { slug } = await params;
  const data = await getProducerBySlug(slug);
  if (!data) notFound();
  const { producer, wines } = data;
  const region = producer.region;

  // 대표 글라스: 이 생산자의 첫 와인에서. 없으면 기본 레드.
  const rep = wines[0];
  const { absorb, glass } = wineGlassFor(
    rep?.type ?? "red",
    rep?.grapes.map((g) => g.grape.nameKo) ?? []
  );

  // 큐레이션 소개·홈페이지(DB 값이 있으면 설명은 그걸 우선).
  const curated = producerInfo(producer.nameKo, producer.nameLocal);
  const description = producer.descriptionKo ?? curated?.desc ?? null;
  const homepage = curated?.homepage ?? null;

  const country = region?.country ?? region?.parent?.nameKo ?? null;
  const fallback =
    region?.latitude != null && region?.longitude != null
      ? { lat: region.latitude, lng: region.longitude }
      : region?.parent?.latitude != null && region?.parent?.longitude != null
        ? { lat: region.parent.latitude, lng: region.parent.longitude }
        : null;

  return (
    <WineDetailView
      absorb={absorb}
      glass={glass}
      country={country}
      regionName={region?.nameKo ?? null}
      fallback={fallback}
      label={producer.nameKo}
    >
      <div className="text-xs uppercase tracking-wide text-muted">생산자</div>
      <h1 className="mt-1 font-serif text-2xl leading-tight text-foreground">{producer.nameKo}</h1>
      {producer.nameLocal ? <p className="text-sm text-muted">{producer.nameLocal}</p> : null}
      {region ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground/80">
          {countryFlag(country) ? <span aria-hidden>{countryFlag(country)}</span> : null}
          <Link
            href={`/region/${region.slug}`}
            className="underline decoration-foreground/25 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
          >
            {region.nameKo}
          </Link>
          {country && country !== region.nameKo ? (
            <span className="text-muted">· {country}</span>
          ) : null}
        </p>
      ) : null}

      {producer.founded != null ? (
        <p className="mt-3 text-sm text-foreground/80">설립 {producer.founded}년</p>
      ) : null}
      {description ? (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
          {description}
        </p>
      ) : null}
      {producer.philosophy ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/75">
          {producer.philosophy}
        </p>
      ) : null}
      {homepage ? (
        <a
          href={homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-gold underline decoration-gold/40 underline-offset-2 transition-colors hover:decoration-gold"
        >
          공식 홈페이지 ↗
        </a>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">이 생산자의 와인</h2>
        <WineList wines={wines} />
      </section>
    </WineDetailView>
  );
}
