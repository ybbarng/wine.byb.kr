// 산지의 떼루아 — 기후·토양·등급·주력 품종·대표 스타일. 값이 있는 항목만 보여준다.
// 데이터는 페이지에서 "DB 우선, 없으면 큐레이션(region-info)"으로 합쳐 넘긴다.

import { GrapeColorDot } from "./grape-color";

export interface Terroir {
  climate?: string | null;
  soil?: string | null;
  classification?: string | null;
  keyGrapes?: string[];
  styles?: string[];
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/12 bg-foreground/5 px-2.5 py-1 text-xs text-foreground/80">
      {children}
    </span>
  );
}

export function RegionTerroir({ climate, soil, classification, keyGrapes, styles }: Terroir) {
  const hasRows = climate || soil || classification;
  const hasGrapes = keyGrapes && keyGrapes.length > 0;
  const hasStyles = styles && styles.length > 0;
  if (!hasRows && !hasGrapes && !hasStyles) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">떼루아</h2>

      {hasRows ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          {climate ? (
            <>
              <dt className="text-muted">기후</dt>
              <dd className="text-foreground/85">{climate}</dd>
            </>
          ) : null}
          {soil ? (
            <>
              <dt className="text-muted">토양</dt>
              <dd className="text-foreground/85">{soil}</dd>
            </>
          ) : null}
          {classification ? (
            <>
              <dt className="text-muted">등급</dt>
              <dd className="text-foreground/85">{classification}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {hasGrapes ? (
        <div className="mt-3">
          <div className="mb-1.5 text-xs text-muted">주력 품종</div>
          <div className="flex flex-wrap gap-2">
            {keyGrapes?.map((g) => (
              <Chip key={g}>
                <GrapeColorDot nameKo={g} />
                {g}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {hasStyles ? (
        <div className="mt-3">
          <div className="mb-1.5 text-xs text-muted">대표 스타일</div>
          <div className="flex flex-wrap gap-2">
            {styles?.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
