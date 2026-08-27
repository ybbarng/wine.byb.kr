"use client";

import Link from "next/link";
import { type ComponentProps, useState } from "react";
import type { CatalogRegionGroup } from "@/app/catalog/page";
import { WineList } from "@/components/WineList";
import { GrapeColorDot } from "@/features/wine/grape-color";

type Tab = "wine" | "region" | "grape";

interface Props {
  wines: ComponentProps<typeof WineList>["wines"];
  regions: CatalogRegionGroup[];
  grapes: { slug: string; nameKo: string; nameLocal: string | null }[];
}

// 도감 탭 뷰 — 와인·산지·품종을 목록으로 훑어본다. 각 항목은 자기 상세로 이동한다.
export function CatalogView({ wines, regions, grapes }: Props) {
  const [tab, setTab] = useState<Tab>("wine");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "wine", label: "와인", count: wines.length },
    { key: "region", label: "산지", count: regions.reduce((n, g) => n + g.regions.length, 0) },
    { key: "grape", label: "품종", count: grapes.length },
  ];

  return (
    <div className="mt-6">
      <div className="flex gap-2 border-b border-foreground/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? "border-wine text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-muted">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "wine" ? <WineList wines={wines} /> : null}

        {tab === "region" ? (
          <div className="flex flex-col gap-6">
            {regions.map((g) => (
              <section key={g.country}>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm text-muted">
                  {g.flag ? <span aria-hidden>{g.flag}</span> : null}
                  {g.countrySlug ? (
                    <Link
                      href={`/region/${g.countrySlug}`}
                      className="text-foreground transition-colors hover:text-wine"
                    >
                      {g.country}
                    </Link>
                  ) : (
                    <span className="text-foreground">{g.country}</span>
                  )}
                </h2>
                {g.regions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {g.regions.map((r) => (
                      <Link
                        key={r.slug}
                        href={`/region/${r.slug}`}
                        className="rounded-lg border border-foreground/12 px-2.5 py-1.5 text-sm text-foreground/85 transition-colors hover:border-foreground/25 hover:bg-foreground/5"
                      >
                        {r.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted/70">하위 산지 정보가 아직 없어요.</p>
                )}
              </section>
            ))}
          </div>
        ) : null}

        {tab === "grape" ? (
          <div className="flex flex-wrap gap-2">
            {grapes.map((g) => (
              <Link
                key={g.slug}
                href={`/grape/${g.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/12 px-3 py-1.5 text-sm text-foreground/85 transition-colors hover:border-foreground/25 hover:bg-foreground/5"
              >
                <GrapeColorDot nameKo={g.nameKo} />
                {g.nameKo}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
