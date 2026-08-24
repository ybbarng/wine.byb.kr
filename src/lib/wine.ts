// 와인 종류 코드 ↔ 한국어 표시 이름. DB에는 영문 코드로, 화면에는 한국어로.
export const WINE_TYPE_LABELS: Record<string, string> = {
  red: "레드",
  white: "화이트",
  rose: "로제",
  sparkling: "스파클링",
  champagne: "샴페인",
  dessert: "디저트",
  fortified: "주정강화",
};

export function wineTypeLabel(type: string | null | undefined): string {
  if (!type) return "기타";
  return WINE_TYPE_LABELS[type] ?? type;
}
