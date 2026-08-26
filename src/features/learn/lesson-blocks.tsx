// 학습 블록 렌더러 — 텍스트·콜아웃·표·비교 카드·스케일 바·스펙트럼을 시각적으로 그린다.

import type { Block } from "./learn-content";

function TextBlock({ heading, body }: { heading?: string; body: string }) {
  return (
    <section>
      {heading ? <h2 className="font-serif text-xl text-foreground">{heading}</h2> : null}
      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">
        {body}
      </p>
    </section>
  );
}

function Callout({ emoji, body }: { emoji?: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-wine/20 bg-wine/[0.06] px-4 py-3">
      {emoji ? <span className="text-xl leading-none">{emoji}</span> : null}
      <p className="text-sm leading-relaxed text-foreground/85">{body}</p>
    </div>
  );
}

function Table({ heading, head, rows }: { heading?: string; head: string[]; rows: string[][] }) {
  return (
    <section>
      {heading ? <h2 className="mb-3 font-serif text-xl text-foreground">{heading}</h2> : null}
      <div className="overflow-hidden rounded-xl border border-foreground/12">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-foreground/[0.04]">
              {head.map((h) => (
                <th
                  key={h}
                  className="border-b border-foreground/10 px-3 py-2 text-left font-medium text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("|")} className="border-t border-foreground/8">
                {row.map((cell, ci) => (
                  <td
                    key={`${ci}:${cell}`}
                    className={
                      ci === 0
                        ? "px-3 py-2 font-medium text-foreground"
                        : "px-3 py-2 text-foreground/80"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cards({
  heading,
  items,
}: {
  heading?: string;
  items: { title: string; tag?: string; body: string }[];
}) {
  return (
    <section>
      {heading ? <h2 className="mb-3 font-serif text-xl text-foreground">{heading}</h2> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.title} className="rounded-xl border border-foreground/12 bg-card/50 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-serif text-lg text-foreground">{it.title}</h3>
              {it.tag ? (
                <span className="shrink-0 rounded-full bg-wine/10 px-2 py-0.5 text-[11px] text-wine">
                  {it.tag}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Scale({
  heading,
  items,
}: {
  heading?: string;
  items: { label: string; level: number; note?: string }[];
}) {
  return (
    <section>
      {heading ? <h2 className="mb-3 font-serif text-xl text-foreground">{heading}</h2> : null}
      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <div key={it.label}>
            <div className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-sm text-foreground">{it.label}</span>
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`h-2 w-7 rounded-full ${i < it.level ? "bg-wine-bright" : "bg-foreground/12"}`}
                  />
                ))}
              </div>
            </div>
            {it.note ? <p className="mt-1 pl-[3.25rem] text-xs text-muted">{it.note}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Spectrum({
  heading,
  leftLabel,
  rightLabel,
  items,
}: {
  heading?: string;
  leftLabel: string;
  rightLabel: string;
  items: { label: string; pos: number }[];
}) {
  return (
    <section>
      {heading ? <h2 className="mb-4 font-serif text-xl text-foreground">{heading}</h2> : null}
      <div className="relative mx-2 mt-8 mb-2 h-px bg-gradient-to-r from-rose/30 via-wine/40 to-wine">
        {items.map((it) => (
          <div
            key={it.label}
            className="absolute -translate-x-1/2"
            style={{ left: `${Math.min(100, Math.max(0, it.pos * 100))}%` }}
          >
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-foreground/85">
              {it.label}
            </span>
            <span className="block h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-background bg-wine" />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>← {leftLabel}</span>
        <span>{rightLabel} →</span>
      </div>
    </section>
  );
}

export function LessonBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-8">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "text":
            return <TextBlock key={i} heading={b.heading} body={b.body} />;
          case "callout":
            return <Callout key={i} emoji={b.emoji} body={b.body} />;
          case "table":
            return <Table key={i} heading={b.heading} head={b.head} rows={b.rows} />;
          case "cards":
            return <Cards key={i} heading={b.heading} items={b.items} />;
          case "scale":
            return <Scale key={i} heading={b.heading} items={b.items} />;
          case "spectrum":
            return (
              <Spectrum
                key={i}
                heading={b.heading}
                leftLabel={b.leftLabel}
                rightLabel={b.rightLabel}
                items={b.items}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
