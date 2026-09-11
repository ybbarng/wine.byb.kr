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
// **시스템 폰트에 기대지 않는다.** 윈도우는 문자별 폰트를 "그 언어를 쓰는 사람에게만
// 나중에 까는" 선택 기능으로 돌려놔서, 태국 문자나 한자를 안 쓰는 사람 기기엔 아예
// 없다. 대신 여기 적힌 글자만 잘라낸 폰트를 쓴다 — `scripts/build-toast-fonts.ts`,
// 아홉 벌 다 합쳐 19KB, 그나마 그 글자가 화면에 나올 때만 내려받는다.
//
// 그래서 **문구를 고치면 폰트를 다시 만들어야 한다.** 안 그러면 새로 넣은 글자만
// 두부(□)가 된다. `toast.test.ts` 가 매니페스트와 문구를 맞춰 보며 잡는다.
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
 * 나라 → 그 나라에서 잔을 들 때 쓰는 말(ISO 639-1. 글자가 갈리면 `zh-TW` 처럼 지역까지).
 *
 * 공용어가 여럿인 나라는 **포도밭이 있는 쪽**으로 골랐다. 스위스는 독일어를 쓰는
 * 사람이 더 많지만 와인은 발레·보 같은 프랑스어권에서 거의 다 나오고, 룩셈부르크는
 * 반대로 포도밭이 모젤 강변이라 독일어 쪽이다. 남아공은 영어가 공용어지만 와인 산지인
 * 케이프는 아프리칸스가 뿌리고, 캐나다는 나이아가라·오카나간 둘 다 영어권이라 영어다.
 *
 * 대만을 중국과 가른 건 글자가 달라서다 — 같은 `zh` 로 묶으면 대만에 간체 `干杯` 가 간다.
 */
const LANGUAGE_OF: Readonly<Record<string, string>> = {
  FR: "fr",
  CH: "fr",
  LU: "de",
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
  BA: "bs",
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
  TW: "zh-TW",
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
  bs: { text: "Živjeli!" },
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
  "zh-TW": { text: "乾杯!" },
  ja: { text: "乾杯!" },
  ko: { text: "건배!" },
  th: { text: "ชนแก้ว!" },
};

/**
 * 문자 체계 → 그 글자를 담을 폰트 이름(구글 폰트).
 *
 * 라틴은 Playfair 가 이미 맡고 있어 없다. 나머지는 `scripts/build-toast-fonts.ts` 가
 * **여기 적힌 글자만** 잘라낸 파일을 만들어 `src/app/fonts/toast/` 에 넣는다.
 */
export const SCRIPT_FONTS: Readonly<Record<string, string>> = {
  greek: "Noto Serif",
  cyrillic: "Noto Serif",
  georgian: "Noto Serif Georgian",
  armenian: "Noto Serif Armenian",
  hebrew: "Noto Serif Hebrew",
  arabic: "Noto Naskh Arabic",
  thai: "Noto Serif Thai",
  hangul: "Noto Serif KR",
  han: "Noto Serif JP",
};

/**
 * 문자 체계별 유니코드 구간.
 *
 * 두 군데가 이 표를 함께 쓴다 — 글자를 문자 체계로 나누는 쪽(아래 `toastCharsByScript`)과
 * `@font-face` 의 `unicode-range` 를 적는 쪽(layout.tsx). **범위 선언이 없으면 브라우저는
 * 그 폰트에 그 글자가 있는지 알아보려고 파일을 일단 받는다** — 조지아어 한 줄 띄우자고
 * 앞에 놓인 그리스·키릴 파일까지 받아 보고 버리게 된다.
 *
 * 글자 하나하나가 아니라 **구간**으로 적는다. 문구를 고쳐도 안 바뀌는 값이어야 폰트를
 * 다시 만들 때마다 layout.tsx 를 따라 고치지 않는다.
 */
const SCRIPT_RANGES: ReadonlyArray<readonly [script: string, from: number, to: number]> = [
  ["greek", 0x370, 0x3ff],
  ["cyrillic", 0x400, 0x4ff],
  ["armenian", 0x530, 0x58f],
  ["hebrew", 0x590, 0x5ff],
  ["arabic", 0x600, 0x6ff],
  ["georgian", 0x10a0, 0x10ff],
  ["thai", 0xe00, 0xe7f],
  ["hangul", 0xac00, 0xd7af],
  ["han", 0x4e00, 0x9fff],
];

/** `@font-face` 의 `unicode-range` 에 그대로 넣을 값. layout.tsx 가 쓰고 테스트가 맞춰 본다. */
export const SCRIPT_UNICODE_RANGE: Readonly<Record<string, string>> = Object.fromEntries(
  SCRIPT_RANGES.map(([script, from, to]) => [
    script,
    `U+${from.toString(16).toUpperCase()}-${to.toString(16).toUpperCase()}`,
  ])
);

/** 건배말에 나오는 글자 전부(중복 없이). */
export function allToastChars(): string[] {
  const out = new Set<string>();
  for (const { text } of Object.values(TOASTS)) for (const ch of text) out.add(ch);
  return [...out];
}

/**
 * 건배말에 쓰인 글자를 문자 체계별로 모은다. 라틴·문장부호는 뺀다 — Playfair 가 맡는다.
 *
 * 폰트를 만드는 쪽(`scripts/build-toast-fonts.ts`)과 만들어진 파일이 문구를 덮는지
 * 확인하는 쪽(`toast.test.ts`)이 **같은 함수**를 본다. 따로 세면 문구를 고치고 폰트를
 * 다시 안 만들었을 때 아무도 모른다.
 */
export function toastCharsByScript(): Record<string, string> {
  const out: Record<string, Set<string>> = {};
  for (const ch of allToastChars()) {
    const hit = SCRIPT_RANGES.find(([, from, to]) => {
      const c = ch.codePointAt(0) ?? 0;
      return c >= from && c <= to;
    });
    if (!hit) continue; // 라틴 글자·문장부호
    const script = hit[0];
    out[script] ??= new Set();
    out[script].add(ch);
  }
  return Object.fromEntries(
    Object.entries(out).map(([script, chars]) => [script, [...chars].sort().join("")])
  );
}

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
