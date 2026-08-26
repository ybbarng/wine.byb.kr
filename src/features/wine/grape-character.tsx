// 품종 특성 — 바디·산도·타닌·당도를 3단계 스케일로, 아로마는 칩으로,
// 음식 페어링은 "무엇과, 왜"를 함께 보여준다(이유를 알면 다른 음식으로도 응용할 수 있다).
// 값이 있는 항목만 그린다. 데이터는 페이지에서 "DB 우선, 없으면 큐레이션(grape-info)"으로 넘긴다.

import type { Pairing } from "./grape-info";

export interface Character {
  body?: string | null;
  acidity?: string | null;
  tannin?: string | null;
  sweetness?: string | null;
  aroma?: string[];
  pairings?: Pairing[];
}

// 각 특성의 3단계. 값이 이 안에 있으면 스케일 바로, 아니면(범위 등) 글자만 보여준다.
const LEVELS: Record<string, string[]> = {
  바디: ["가벼움", "중간", "묵직함"],
  산도: ["낮음", "중간", "높음"],
  타닌: ["낮음", "중간", "높음"],
  당도: ["드라이", "오프드라이", "스위트"],
};

function Scale({ label, value }: { label: string; value: string }) {
  const levels = LEVELS[label] ?? [];
  const idx = levels.indexOf(value);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-10 shrink-0 text-muted">{label}</span>
      {idx >= 0 ? (
        <div className="flex gap-1" aria-hidden>
          {levels.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i <= idx ? "bg-wine-bright" : "bg-foreground/12"}`}
            />
          ))}
        </div>
      ) : null}
      <span className="text-foreground/85">{value}</span>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <span
            key={s}
            className="rounded-full border border-foreground/12 bg-foreground/5 px-2.5 py-1 text-xs text-foreground/80"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GrapeCharacter({ body, acidity, tannin, sweetness, aroma, pairings }: Character) {
  const rows: [string, string][] = [];
  if (body) rows.push(["바디", body]);
  if (acidity) rows.push(["산도", acidity]);
  if (tannin) rows.push(["타닌", tannin]);
  if (sweetness) rows.push(["당도", sweetness]);
  const hasAroma = aroma && aroma.length > 0;
  const hasPairings = pairings && pairings.length > 0;
  if (rows.length === 0 && !hasAroma && !hasPairings) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">특성</h2>
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {rows.map(([label, value]) => (
            <Scale key={label} label={label} value={value} />
          ))}
        </div>
      ) : null}
      {hasAroma ? <Chips label="아로마" items={aroma ?? []} /> : null}
      {hasPairings ? <Pairings items={pairings ?? []} /> : null}
    </section>
  );
}

// 음식 페어링 — 무엇과, 그리고 왜. 이유를 함께 읽어 다른 음식으로 대체할 때도 참고한다.
function Pairings({ items }: { items: Pairing[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-xs text-muted">어울리는 음식</div>
      <ul className="flex flex-col gap-2">
        {items.map((p) => (
          <li
            key={p.food}
            className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2"
          >
            <div className="text-sm text-foreground">{p.food}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-muted">{p.why}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
