import Link from "next/link";
import { joinDot } from "@/lib/format";
import { wineDisplayName, wineTypeLabel } from "@/lib/wine";

type WineItem = {
  id: string;
  slug: string;
  nameKo: string;
  nameLocal: string | null;
  type: string | null;
  region?: {
    nameKo: string;
    country: string | null;
    parent?: { nameKo: string } | null;
  } | null;
};

// 컬렉션(산지·품종·타입) 상세 패널의 와인 목록. 각 항목 → /wine/[slug].
export function WineList({ wines }: { wines: WineItem[] }) {
  if (wines.length === 0) {
    return <p className="text-sm text-muted">해당하는 와인이 아직 없어요.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {wines.map((w) => {
        const name = wineDisplayName(w);
        const country = w.region?.country ?? w.region?.parent?.nameKo ?? null;
        return (
          <li key={w.id}>
            <Link
              href={`/wine/${w.slug}`}
              className="flex flex-col rounded-lg border border-foreground/10 px-3 py-2 transition-colors hover:border-foreground/25 hover:bg-foreground/5"
            >
              <span className="truncate text-sm text-foreground">{name.primary}</span>
              <span className="mt-0.5 truncate text-xs text-muted">
                {joinDot(wineTypeLabel(w.type), w.region?.nameKo, country)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
