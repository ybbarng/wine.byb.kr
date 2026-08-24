// 한국어 국가명 → Natural Earth 영문명(전세계 경계 GeoJSON 매칭용).
// 와인 생산국 위주로 담되, 새 나라가 나오면 한 줄 추가하면 된다.
const KO_TO_EN: Record<string, string> = {
  프랑스: "France",
  이탈리아: "Italy",
  미국: "United States of America",
  칠레: "Chile",
  아르헨티나: "Argentina",
  뉴질랜드: "New Zealand",
  독일: "Germany",
  헝가리: "Hungary",
  남아프리카공화국: "South Africa",
  호주: "Australia",
  스페인: "Spain",
  포르투갈: "Portugal",
  오스트리아: "Austria",
  그리스: "Greece",
  조지아: "Georgia",
  캐나다: "Canada",
  우루과이: "Uruguay",
  브라질: "Brazil",
  스위스: "Switzerland",
  슬로베니아: "Slovenia",
  크로아티아: "Croatia",
  루마니아: "Romania",
  불가리아: "Bulgaria",
  몰도바: "Moldova",
  레바논: "Lebanon",
  이스라엘: "Israel",
  영국: "United Kingdom",
  중국: "China",
  일본: "Japan",
  멕시코: "Mexico",
};

export function englishCountry(ko: string | null | undefined): string | null {
  if (!ko) return null;
  return KO_TO_EN[ko.trim()] ?? null;
}
