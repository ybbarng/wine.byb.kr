// 국내 소매(와인샵·대형마트) 적정가 범위(원). 편의점·픽업 실구매가가 이 범위 대비
// 어땠는지("잘 샀는지/적정/과했는지") 판단하는 기준선이다.
//
// 주의: 국내 와인 가격은 편의점/마트/와인샵/직수입 편차가 크고 시세도 변하므로
// 단일값이 아니라 "범위"이며, 2024–2025 시장 기준의 대략 추정치다. 화면에도 "추정"을
// 함께 표시한다. 글로벌 평균가(Wine-Searcher류)에 국내 수입 마진·주세·관세를 얹은
// 통상 소매가 감각으로 매겼다. 값은 슬러그로 찾고, 없으면 표시하지 않는다.

export type WinePrice = {
  low: number; // 적정가 하단(이보다 싸면 잘 산 것)
  high: number; // 적정가 상단(이보다 비싸면 과한 것)
  note?: string; // 근거·비고(선택)
};

const PRICES: Record<string, WinePrice> = {
  "henri-bourgeois-sancerre-les-baronnes": { low: 45000, high: 60000 },
  "esterhazy-klimt-red": { low: 15000, high: 24000 },
  "chateau-pey-la-tour-reserve": { low: 18000, high: 28000 },
  "tosti-moscato-d-asti": { low: 14000, high: 22000 },
  "montgras-intriga-maxima": {
    low: 90000,
    high: 130000,
    note: "몬그라스의 아이콘 와인(마이푸 카베르네).",
  },
  "carlo-sani-susumaniello": { low: 14000, high: 22000 },
  "gosset-grand-rose-brut": {
    low: 110000,
    high: 150000,
    note: "고세 그랑 로제 — 국내 유통가가 높은 편.",
  },
  "domaine-laroche-chablis-saint-martin": { low: 40000, high: 55000 },
  "pesquera-crianza": {
    low: 40000,
    high: 55000,
    note: "리베라 델 두에로 대표 크리안사(페스케라).",
  },
  "fattoria-dei-barbi-brunello-blue-label": { low: 80000, high: 115000 },
  "errazuriz-aconcagua-costa-chardonnay": { low: 28000, high: 40000 },
  "vranken-pommery-brut-nature": { low: 55000, high: 75000 },
  "domaine-vincent-fournier-bourgogne-chardonnay": { low: 30000, high: 42000 },
  "domaine-des-ardillers-anjou-blanc": { low: 24000, high: 34000 },
  "luigi-baudana-langhe-bianco": { low: 38000, high: 52000 },
  "luigi-baudana-langhe-rosso": { low: 33000, high: 46000 },
  "muga-reserva": { low: 42000, high: 58000 },
  "brown-brothers-premium-cuvee": { low: 22000, high: 34000 },
  "marques-de-monistrol-cava-brut": {
    low: 13000,
    high: 19000,
    note: "대중적인 스페인 카바 브뤼(전통방식).",
  },
};

export function winePrice(slug: string): WinePrice | null {
  return PRICES[slug] ?? null;
}

export type PriceVerdictKey = "great" | "good" | "fair" | "high" | "steep";

export type PriceVerdict = {
  key: PriceVerdictKey;
  label: string; // 배지 문구
  tone: "gold" | "muted" | "wine"; // 테마 색
};

// 실구매가(paid)를 적정가 범위와 비교해 판정. 범위보다 싸면 잘 산 것, 넘으면 과한 것.
export function priceVerdict(paid: number, p: WinePrice): PriceVerdict {
  if (paid <= p.low * 0.85) return { key: "great", label: "아주 잘 샀어요", tone: "gold" };
  if (paid <= p.low) return { key: "good", label: "잘 샀어요", tone: "gold" };
  if (paid <= p.high) return { key: "fair", label: "적정가", tone: "muted" };
  if (paid <= p.high * 1.2) return { key: "high", label: "조금 비싸게", tone: "wine" };
  return { key: "steep", label: "비싸게 샀어요", tone: "wine" };
}
