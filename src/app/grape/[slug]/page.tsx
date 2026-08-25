import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WineDetailView } from "@/components/WineDetailView";
import { WineList } from "@/components/WineList";
import { getGrapeBySlug } from "@/features/wine/collection-queries";
import { wineGlassFor } from "@/features/wine/wine-glass";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/grape/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getGrapeBySlug(slug);
  return { title: data ? `${data.grape.nameKo} 품종` : "품종을 찾을 수 없음" };
}

// (러프) 품종 상세 — 왼쪽 글라스(품종 색)·가운데 지도(대표 산지)·오른쪽 설명+와인.
export default async function GrapePage({ params }: PageProps<"/grape/[slug]">) {
  const { slug } = await params;
  const data = await getGrapeBySlug(slug);
  if (!data) notFound();
  const { grape, wines } = data;

  // 글라스: 품종 색을 기준으로. 화이트/레드 여부는 grape.color로 잡는다.
  const baseType = grape.color === "white" ? "white" : "red";
  const { absorb, glass } = wineGlassFor(baseType, [grape.nameKo]);

  // aromaProfile은 JSON 배열 문자열 → 안전하게 "· "로 잇는다.
  let aroma = "";
  if (grape.aromaProfile) {
    try {
      const arr = JSON.parse(grape.aromaProfile);
      aroma = Array.isArray(arr) ? arr.join(" · ") : String(grape.aromaProfile);
    } catch {
      aroma = grape.aromaProfile;
    }
  }

  // 지도: 이 품종을 쓴 대표 와인의 산지.
  const rep = wines[0]?.region ?? null;
  const country = rep?.country ?? rep?.parent?.nameKo ?? null;
  const fallback =
    rep?.latitude != null && rep?.longitude != null
      ? { lat: rep.latitude, lng: rep.longitude }
      : null;

  return (
    <WineDetailView
      absorb={absorb}
      glass={glass}
      country={country}
      regionName={rep?.nameKo ?? null}
      fallback={fallback}
      label={grape.nameKo}
    >
      <div className="text-xs uppercase tracking-wide text-muted">포도 품종</div>
      <h1 className="mt-1 font-serif text-2xl leading-tight text-foreground">{grape.nameKo}</h1>
      {grape.nameLocal ? <p className="text-sm text-muted">{grape.nameLocal}</p> : null}

      {grape.descriptionKo ? (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
          {grape.descriptionKo}
        </p>
      ) : null}

      {aroma ? (
        <p className="mt-3 text-sm text-foreground/80">
          <span className="text-muted">아로마</span> · {aroma}
        </p>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">이 품종의 와인</h2>
        <WineList wines={wines} />
      </section>
    </WineDetailView>
  );
}
