// 와인 하나를 "종합 판단"할 수 있게, 타입·품종·산지·등급을 모아 프로필을 만든다.
// 색·서빙 온도는 타입/품종에서 유도하고, 수준(고급/보급)은 아는 와인만 큐레이션한다.
import type { GrapeDetail } from "@/features/wine/curation/grape-info";

export interface WineProfile {
  color: string; // 색
  body: string | null; // 바디
  sweetness: string; // 당도
  servingTemp: string; // 서빙 온도
  tier: string | null; // 이 와이너리에서의 수준
}

// 타입별 서빙 온도. 라이트 레드는 더 낮게.
const SERVE_TEMP: Record<string, string> = {
  red: "16–18°C",
  white: "8–10°C",
  rose: "8–10°C",
  sparkling: "6–8°C",
  champagne: "6–8°C",
  dessert: "6–8°C",
  fortified: "14–16°C",
};
const LIGHT_REDS = new Set(["피노 누아", "가메"]);
// 색이 짙은 레드 품종.
const DEEP_REDS = new Set([
  "카베르네 소비뇽",
  "까베르네 소비뇽",
  "말벡",
  "시라",
  "쉬라즈",
  "무르베드르",
  "수수마니엘로",
  "네그로아마로",
]);
// 옅은 레드 품종.
const PALE_REDS = new Set(["피노 누아", "네비올로", "가메"]);

function colorText(type: string, primary: string | null, isRoseWine: boolean): string {
  if (type === "champagne" || type === "sparkling") {
    return isRoseWine ? "연한 분홍빛, 섬세한 기포" : "옅은 금빛, 섬세한 기포";
  }
  if (type === "rose") return "연한 분홍빛";
  if (type === "dessert") return "옅은 금빛";
  if (type === "white") {
    if (primary === "샤르도네") return "레몬~옅은 골드빛";
    return "옅은 레몬빛";
  }
  // red
  if (primary && DEEP_REDS.has(primary)) return "짙은 자주빛";
  if (primary && PALE_REDS.has(primary)) return "옅은 루비~가넷빛";
  return "루비빛";
}

function sweetnessText(type: string, grape: GrapeDetail | null, primary: string | null): string {
  if (grape?.sweetness) return grape.sweetness;
  if (type === "dessert") return "스위트";
  if (primary === "무스캇" || primary === "모스카토") return "스위트";
  return "드라이";
}

// 이 와이너리에서 이 와인의 수준(아는 것만). 없으면 등급 문자열로 대체.
const WINE_TIER: Record<string, string> = {
  "montgras-intriga-maxima": "몽그라스의 아이콘 — 최상급",
  "muga-reserva": "무가의 상급 레세르바",
  "fattoria-dei-barbi-brunello-blue-label": "바르비의 대표 브루넬로 — 상급",
  "gosset-grand-rose-brut": "고세의 대표 로제 — 상급",
  "errazuriz-aconcagua-costa-chardonnay": "에라주리즈 프리미엄 라인 — 중상급",
  "henri-bourgeois-sancerre-les-baronnes": "앙리 부르주아의 대표 상세르 — 중급",
  "domaine-laroche-chablis-saint-martin": "라로쉬의 기본 샤블리 — 중급",
  "pesquera-crianza": "뻬스께라의 기본 크리안자 — 중급",
  "vranken-pommery-brut-nature": "뽀므리의 브뤼 나투르 — 중급",
  "domaine-vincent-fournier-bourgogne-chardonnay": "기본 부르고뉴 — 중급",
  "luigi-baudana-langhe-bianco": "바우다나의 데일리 화이트 — 중급",
  "luigi-baudana-langhe-rosso": "바우다나의 데일리 레드 — 중급",
  "chateau-pey-la-tour-reserve": "도르트의 데일리 보르도 — 보급",
  "tosti-moscato-d-asti": "또스띠의 데일리 — 보급",
  "carlo-sani-susumaniello": "데일리 뿔리아 — 보급",
  "domaine-des-ardillers-anjou-blanc": "데일리 앙주 — 보급",
  "esterhazy-klimt-red": "에스터하지의 데일리 큐베 — 보급",
  "brown-brothers-premium-cuvee": "브라운 브라더스의 스파클링 — 보급",
};

export function wineProfile(
  wine: {
    type: string | null;
    slug: string;
    classification: string | null;
    nameLocal: string | null;
    nameKo: string;
  },
  grape: GrapeDetail | null,
  primaryGrape: string | null
): WineProfile {
  const type = wine.type ?? "red";
  const name = `${wine.nameLocal ?? ""} ${wine.nameKo}`;
  const isRoseWine = /로제|Rosé|Rose/i.test(name);

  const servingTemp =
    type === "red" && primaryGrape && LIGHT_REDS.has(primaryGrape)
      ? "14–16°C"
      : (SERVE_TEMP[type] ?? "16–18°C");

  const bodyFallback =
    type === "white" || type === "sparkling" || type === "champagne"
      ? "가벼움~중간"
      : "중간~묵직함";

  return {
    color: colorText(type, primaryGrape, isRoseWine),
    body: grape?.body ?? bodyFallback,
    sweetness: sweetnessText(type, grape, primaryGrape),
    servingTemp,
    tier: WINE_TIER[wine.slug] ?? wine.classification ?? null,
  };
}
