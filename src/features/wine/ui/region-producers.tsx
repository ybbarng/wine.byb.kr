// 이 산지의 생산자 목록. 각 항목 → /producer/[slug]. 생산자가 없으면 아무것도 안 그린다.

import Link from "next/link";

type ProducerItem = {
  id: string;
  slug: string;
  nameKo: string;
  nameLocal: string | null;
  _count: { wines: number };
};

export function RegionProducers({ producers }: { producers: ProducerItem[] }) {
  if (producers.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">생산자</h2>
      <div className="flex flex-wrap gap-2">
        {producers.map((p) => (
          <Link
            key={p.id}
            href={`/producer/${p.slug}`}
            className="flex flex-col rounded-lg border border-foreground/12 px-3 py-1.5 transition-colors hover:border-foreground/25 hover:bg-foreground/5"
          >
            <span className="text-sm text-foreground">{p.nameKo}</span>
            <span className="text-xs text-muted">
              {p.nameLocal ? `${p.nameLocal} · ` : ""}와인 {p._count.wines}종
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
