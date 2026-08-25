// 와인 산지의 계층(국가 → 지역 → 마을 → 밭)을 단계별로 짙어지는 색으로 보여준다.
// 각 레벨이 무엇을 뜻하는지(일반 설명)와, 실제 그 곳이 어떤 산지인지(구체 설명)를 함께.
// 이 와인은 국가·지역까지 기록돼 있고, 마을·밭은 개념으로 설명한다.

import { countryInfo, regionInfo } from "./region-info";

interface Level {
  key: string;
  en: string;
  desc: string;
  /** 배경(짙어지는 순서)과 왼쪽 강조 바. */
  bg: string;
  bar: string;
  indent: string;
}

const LEVELS: Level[] = [
  {
    key: "국가",
    en: "Country",
    desc: "가장 넓은 단위. 기후대와 등급 제도(예: 프랑스 AOC)의 큰 틀을 정한다.",
    bg: "bg-wine/10",
    bar: "border-gold/30",
    indent: "ml-0",
  },
  {
    key: "지역",
    en: "Region",
    desc: "기후·토양의 성격이 갈리는 단위(예: 보르도 vs 부르고뉴). 대표 품종과 양조 전통이 정해진다.",
    bg: "bg-wine/20",
    bar: "border-gold/45",
    indent: "ml-4",
  },
  {
    key: "마을",
    en: "Village",
    desc: "같은 지역 안에서도 마을마다 개성이 다르다(예: 뽀이약). 라벨의 마을 이름은 더 좁은 스타일을 뜻한다.",
    bg: "bg-wine/35",
    bar: "border-gold/60",
    indent: "ml-8",
  },
  {
    key: "밭",
    en: "Vineyard",
    desc: "가장 좁은 단위. 경사·토양이 미세하게 다른 한 조각 땅의 떼루아. 최상급은 단일 밭에서 나온다.",
    bg: "bg-wine/50",
    bar: "border-gold/80",
    indent: "ml-12",
  },
];

export function RegionHierarchy({
  country,
  regionName,
}: {
  country: string | null;
  regionName: string | null;
}) {
  // 국가·지역에는 이 와인의 실제 값을, 마을·밭에는 "개념"을 채운다.
  const values = [country, regionName, null, null];
  // 실제 그 곳에 대한 구체 설명(국가·지역만).
  const region = regionInfo(regionName);
  const details = [countryInfo(country), region?.desc ?? null, null, null];

  return (
    <div className="flex flex-col gap-1.5">
      {LEVELS.map((lv, i) => {
        const value = values[i];
        const detail = details[i];
        return (
          <div
            key={lv.key}
            className={`${lv.indent} rounded-lg border-l-2 ${lv.bar} ${lv.bg} px-3 py-2.5`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs tracking-wide text-gold/70">{lv.key}</span>
              <span className="text-[10px] uppercase tracking-wider text-rose/35">{lv.en}</span>
              {value ? (
                <span className="font-serif text-foreground">{value}</span>
              ) : (
                <span className="text-sm text-rose/40">개념</span>
              )}
            </div>
            {detail ? (
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{detail}</p>
            ) : null}
            <p className="mt-1 text-xs leading-relaxed text-rose/50">{lv.desc}</p>
          </div>
        );
      })}
    </div>
  );
}
