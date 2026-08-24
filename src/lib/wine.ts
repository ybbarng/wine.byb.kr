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

/**
 * 와인 이름을 원어 우선으로 보여준다. 원어(nameLocal)를 크게, 한국어(nameKo)는 보조로.
 * 원어가 없으면 한국어가 대표 이름이 되고 보조 이름은 없다.
 */
export function wineDisplayName(wine: { nameKo: string; nameLocal: string | null }): {
  primary: string;
  alias: string | null;
} {
  if (wine.nameLocal) return { primary: wine.nameLocal, alias: wine.nameKo };
  return { primary: wine.nameKo, alias: null };
}
