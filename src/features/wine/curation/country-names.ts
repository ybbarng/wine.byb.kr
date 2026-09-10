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

// 한국어 국가명 → ISO 3166-1 alpha-2. 국기 이모지를 만드는 데 쓴다.
const KO_TO_ISO2: Record<string, string> = {
  프랑스: "FR",
  이탈리아: "IT",
  미국: "US",
  칠레: "CL",
  아르헨티나: "AR",
  뉴질랜드: "NZ",
  독일: "DE",
  헝가리: "HU",
  남아프리카공화국: "ZA",
  호주: "AU",
  스페인: "ES",
  포르투갈: "PT",
  오스트리아: "AT",
  그리스: "GR",
  조지아: "GE",
  캐나다: "CA",
  우루과이: "UY",
  브라질: "BR",
  스위스: "CH",
  슬로베니아: "SI",
  크로아티아: "HR",
  루마니아: "RO",
  불가리아: "BG",
  몰도바: "MD",
  레바논: "LB",
  이스라엘: "IL",
  영국: "GB",
  중국: "CN",
  일본: "JP",
  멕시코: "MX",
};

// alpha-2 문자를 유니코드 지역 표시 기호로 옮기면 국기 이모지가 된다(FR → 🇫🇷).
export function countryFlag(ko: string | null | undefined): string | null {
  if (!ko) return null;
  const iso = KO_TO_ISO2[ko.trim()];
  if (!iso) return null;
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
