// 건배말 — 잔이 바뀔 때 그 와인이 온 나라의 말로 한 마디.
//
// 나라 이름에서 문장까지 세 단계로 간다.
//
//   "프랑스" ─(COUNTRIES)→ "FR" ─(LANGUAGE_OF)→ "fr" ─(TOASTS)→ "Santé !"
//
// **나라마다 문장을 적어 두지 않는 이유**: 스페인어를 쓰는 나라만 해도 스페인·칠레·
// 아르헨티나·멕시코·우루과이·페루가 전부 ¡Salud! 다. 나라에 문장을 직접 붙이면 같은
// 말을 여섯 번 적게 되고, 고칠 때 한둘을 빠뜨린다. 언어를 가운데 두면 한 번만 적는다.
//
// **그 나라 문자 그대로 쓴다.** 로마자로 옮겨 적으면(gaumarjos) 읽기는 쉬워도 어느
// 나라 말인지가 사라진다. 대신 읽을 수 없는 글자일 때를 위해 나라 이름을 함께 준다.
//
// 폰트는 따로 싣지 않는다 — 그리스·키릴·조지아·히브리·태국·한자까지 브라우저가
// 시스템 폰트로 채우는 것을 화면에서 확인했다. 글자마다 폰트를 되짚는 건 브라우저가
// 알아서 하므로, 쓰는 쪽은 `lang` 만 정확히 달아 주면 된다.
//
// 모르는 나라면 아무 말도 하지 않는다(null). 어설프게 영어 Cheers 로 때우면 그 와인이
// 어디서 왔는지를 오히려 흐린다.

export type Toast = {
  /** 그 나라 문자 그대로. */
  text: string;
  /** `lang` 속성에 넣을 값. 브라우저가 문자에 맞는 글꼴·자간을 고르는 근거다. */
  lang: string;
  /** 오른쪽에서 왼쪽으로 쓰는 글자인가. 안 알려 주면 느낌표가 반대쪽에 붙는다. */
  rtl: boolean;
  /** 아래 작은 줄에 쓸 나라 이름. 읽을 수 없는 글자일 때는 이게 유일한 단서다. */
  countryKo: string;
};

/**
 * 나라 이름 → ISO 3166-1 alpha-2.
 *
 * 첫 이름이 대표 표기고, 나머지는 같은 나라를 달리 적은 것이다. **부분 일치로 찾는다**
 * — 산지 데이터의 국가명이 늘 같은 표기라는 보장이 없다. 예전에 품종을 `Record` 키로
 * 정확히 맞추려다 "카베르네"와 "까베르네"가 서로 다른 품종이 된 적이 있다(#121).
 */
const COUNTRIES: ReadonlyArray<readonly [code: string, names: readonly string[]]> = [
  // 유럽 — 와인의 본가
  ["FR", ["프랑스"]],
  ["IT", ["이탈리아"]],
  ["ES", ["스페인"]],
  ["PT", ["포르투갈"]],
  ["DE", ["독일"]],
  ["AT", ["오스트리아"]],
  ["CH", ["스위스"]],
  ["LU", ["룩셈부르크"]],
  ["NL", ["네덜란드"]],
  ["BE", ["벨기에"]],
  ["GB", ["영국", "잉글랜드", "웨일스", "스코틀랜드"]],
  ["IE", ["아일랜드"]],
  ["GR", ["그리스"]],
  ["HU", ["헝가리"]],
  ["RO", ["루마니아"]],
  ["MD", ["몰도바"]],
  ["BG", ["불가리아"]],
  ["HR", ["크로아티아"]],
  ["SI", ["슬로베니아"]],
  ["RS", ["세르비아"]],
  ["BA", ["보스니아"]],
  ["MK", ["북마케도니아", "마케도니아"]],
  ["AL", ["알바니아"]],
  ["CZ", ["체코"]],
  ["SK", ["슬로바키아"]],
  ["PL", ["폴란드"]],
  ["UA", ["우크라이나"]],
  ["RU", ["러시아"]],
  ["EE", ["에스토니아"]],
  ["LV", ["라트비아"]],
  ["LT", ["리투아니아"]],
  ["SE", ["스웨덴"]],
  ["DK", ["덴마크"]],
  ["NO", ["노르웨이"]],
  ["FI", ["핀란드"]],
  ["IS", ["아이슬란드"]],
  // 신대륙
  ["US", ["미국"]],
  ["CA", ["캐나다"]],
  ["MX", ["멕시코"]],
  ["CL", ["칠레"]],
  ["AR", ["아르헨티나"]],
  ["UY", ["우루과이"]],
  ["BR", ["브라질"]],
  ["PE", ["페루"]],
  ["AU", ["호주", "오스트레일리아"]],
  ["NZ", ["뉴질랜드"]],
  ["ZA", ["남아프리카공화국", "남아공"]],
  // 그 밖
  ["GE", ["조지아"]],
  ["AM", ["아르메니아"]],
  ["TR", ["터키", "튀르키예"]],
  ["IL", ["이스라엘"]],
  ["LB", ["레바논"]],
  ["CN", ["중국"]],
  ["TW", ["대만"]],
  ["JP", ["일본"]],
  ["KR", ["한국", "대한민국"]],
  ["TH", ["태국"]],
];

/**
 * 나라 → 그 나라에서 잔을 들 때 쓰는 말(ISO 639-1).
 *
 * 공용어가 여럿인 나라는 **포도밭이 있는 쪽**으로 골랐다. 스위스는 독일어를 쓰는
 * 사람이 더 많지만 와인은 발레·보 같은 프랑스어권에서 거의 다 나오고, 남아공은
 * 영어가 공용어지만 와인 산지인 케이프는 아프리칸스가 뿌리다. 캐나다는 반대로
 * 나이아가라·오카나간 둘 다 영어권이라 영어다.
 */
const LANGUAGE_OF: Readonly<Record<string, string>> = {
  FR: "fr",
  CH: "fr",
  LU: "fr",
  BE: "nl",
  IT: "it",
  ES: "es",
  MX: "es",
  CL: "es",
  AR: "es",
  UY: "es",
  PE: "es",
  PT: "pt",
  BR: "pt",
  DE: "de",
  AT: "de",
  NL: "nl",
  GB: "en",
  US: "en",
  CA: "en",
  AU: "en",
  NZ: "en",
  IE: "ga",
  ZA: "af",
  GR: "el",
  HU: "hu",
  RO: "ro",
  MD: "ro",
  BG: "bg",
  HR: "hr",
  BA: "hr",
  SI: "sl",
  RS: "sr",
  MK: "mk",
  AL: "sq",
  CZ: "cs",
  SK: "sk",
  PL: "pl",
  UA: "uk",
  RU: "ru",
  EE: "et",
  LV: "lv",
  LT: "lt",
  SE: "sv",
  DK: "da",
  NO: "nb",
  FI: "fi",
  IS: "is",
  GE: "ka",
  AM: "hy",
  TR: "tr",
  IL: "he",
  LB: "ar",
  CN: "zh",
  TW: "zh",
  JP: "ja",
  KR: "ko",
  TH: "th",
};

/**
 * 언어 → 그 말로 건배할 때 하는 말.
 *
 * **번역기를 믿지 말 것.** 사전에서 "cheers"를 찾으면 정작 그 나라 사람은 안 쓰는 말이
 * 나온다. 러시아어 `На здоровье!` 가 그렇다 — 고맙다는 인사에 답할 때 쓰는 말이고,
 * 건배로 쓰는 건 미국 영화가 만든 오해다. 러시아어는 무엇을 위해 마시는지를 밝혀
 * `За …!` 꼴로 말한다. 태국어 `ไชโย` 도 생일·결혼처럼 "만세" 를 외치는 자리 쪽이고,
 * 술자리에서는 잔을 부딪친다는 뜻의 `ชนแก้ว` 를 쓴다.
 *
 * 아랍어는 듣는 사람의 성별에 따라 어미가 갈린다(-ak / -ik). 화면은 상대가 누군지
 * 모르므로 여럿을 부르는 꼴(-kum)로 둔다.
 */
const TOASTS: Readonly<Record<string, { text: string; rtl?: true }>> = {
  fr: { text: "Santé !" },
  it: { text: "Cin cin!" },
  es: { text: "¡Salud!" },
  pt: { text: "Saúde!" },
  de: { text: "Prost!" },
  nl: { text: "Proost!" },
  en: { text: "Cheers!" },
  ga: { text: "Sláinte!" },
  af: { text: "Gesondheid!" },
  el: { text: "Γεια μας!" },
  hu: { text: "Egészségedre!" },
  ro: { text: "Noroc!" },
  bg: { text: "Наздраве!" },
  hr: { text: "Živjeli!" },
  sl: { text: "Na zdravje!" },
  sr: { text: "Живели!" },
  mk: { text: "На здравје!" },
  sq: { text: "Gëzuar!" },
  cs: { text: "Na zdraví!" },
  sk: { text: "Na zdravie!" },
  pl: { text: "Na zdrowie!" },
  uk: { text: "Будьмо!" },
  ru: { text: "За здоровье!" },
  et: { text: "Terviseks!" },
  lv: { text: "Priekā!" },
  lt: { text: "Į sveikatą!" },
  sv: { text: "Skål!" },
  da: { text: "Skål!" },
  nb: { text: "Skål!" },
  fi: { text: "Kippis!" },
  is: { text: "Skál!" },
  ka: { text: "გაუმარჯოს!" },
  hy: { text: "Կենաց!" },
  tr: { text: "Şerefe!" },
  he: { text: "לחיים!", rtl: true },
  ar: { text: "بصحتكم!", rtl: true },
  zh: { text: "干杯!" },
  ja: { text: "乾杯!" },
  ko: { text: "건배!" },
  th: { text: "ชนแก้ว!" },
};

/**
 * 건배말을 아는 나라들(대표 표기).
 *
 * 표에서 뽑아 쓰므로 나라를 추가하면 여기도 같이 늘어난다. 테스트가 이 목록을 돌며
 * "이름은 넣었는데 언어나 문장을 안 넣은" 나라를 잡는다 — 세 단계를 거치는 구조라
 * 가운데 한 칸을 빠뜨리기 쉽다.
 */
export const COVERED_COUNTRIES: readonly string[] = COUNTRIES.map(([, names]) => names[0]);

/** 표기 차이를 지운다 — 공백·가운뎃점이 들어간 국가명이 섞여 있어도 찾히게. */
function norm(s: string): string {
  return s.replace(/[\s·・,]/g, "");
}

/**
 * 나라 이름을 ISO 3166-1 alpha-2 로. 못 찾으면 `null`.
 *
 * **가장 긴 이름부터 맞춰 본다.** 짧은 이름이 먼저 걸리면 더 정확한 이름이 있는데도
 * 엉뚱한 나라로 간다.
 */
export function countryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const hay = norm(country);
  let best: { code: string; len: number } | null = null;
  for (const [code, names] of COUNTRIES) {
    for (const name of names) {
      const n = norm(name);
      if (hay.includes(n) && (!best || n.length > best.len)) {
        best = { code, len: n.length };
      }
    }
  }
  return best?.code ?? null;
}

/** 나라 이름 → 그 나라 말 건배말. 모르는 나라면 `null`. */
export function toastFor(country: string | null | undefined): Toast | null {
  const code = countryCode(country);
  if (!code) return null;
  const lang = LANGUAGE_OF[code];
  const t = lang ? TOASTS[lang] : undefined;
  if (!lang || !t) return null;
  const names = COUNTRIES.find(([c]) => c === code)?.[1];
  return { text: t.text, lang, rtl: t.rtl === true, countryKo: names?.[0] ?? code };
}
