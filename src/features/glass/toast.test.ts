import { describe, expect, it } from "vitest";
import manifest from "../../app/fonts/toast/manifest.json" with { type: "json" };
import {
  COVERED_COUNTRIES,
  countryCode,
  SCRIPT_FONTS,
  toastCharsByScript,
  toastFor,
} from "./toast";

/** 산지 데이터에 실제로 들어 있는 국가명(2026-09 기준 12개). 여기가 다 나와야 한다. */
const IN_DB = [
  "프랑스",
  "이탈리아",
  "칠레",
  "미국",
  "뉴질랜드",
  "호주",
  "아르헨티나",
  "스페인",
  "헝가리",
  "오스트리아",
  "독일",
  "남아프리카공화국",
];

describe("나라 이름 → 나라 코드", () => {
  it("지금 DB 에 있는 나라는 하나도 빠짐없이 찾는다", () => {
    for (const c of IN_DB) {
      expect(countryCode(c), c).not.toBeNull();
    }
  });

  it("나라 이름끼리 서로를 품지 않는다", () => {
    // 부분 일치로 찾으므로, 한 나라 이름이 다른 나라 이름 안에 들어 있으면 어느 쪽이
    // 걸릴지 표 순서에 달리게 된다. 나라를 새로 넣을 때 여기서 먼저 걸리라고 둔다.
    for (const a of COVERED_COUNTRIES) {
      for (const b of COVERED_COUNTRIES) {
        if (a === b) continue;
        expect(b.includes(a), `"${b}" 안에 "${a}" 가 들어 있다`).toBe(false);
      }
    }
  });

  it("오스트리아와 오스트레일리아를 헷갈리지 않는다", () => {
    expect(countryCode("오스트리아")).toBe("AT");
    expect(countryCode("오스트레일리아")).toBe("AU");
    expect(countryCode("호주")).toBe("AU");
  });

  it("표기가 조금 달라도 찾는다 — 정확히 같은 문자열만 받으면 데이터가 바뀔 때 말이 사라진다", () => {
    expect(countryCode("프랑스 공화국")).toBe("FR");
    expect(countryCode("남아프리카 공화국")).toBe("ZA");
    expect(countryCode("튀르키예")).toBe("TR");
    expect(countryCode("터키")).toBe("TR");
  });

  it("모르는 나라·빈 값은 null", () => {
    expect(countryCode("바누아투")).toBeNull();
    expect(countryCode("")).toBeNull();
    expect(countryCode(null)).toBeNull();
    expect(countryCode(undefined)).toBeNull();
  });
});

describe("나라 → 건배말", () => {
  it("DB 의 모든 나라에 건배말이 있다", () => {
    for (const c of IN_DB) {
      expect(toastFor(c)?.text, c).toBeTruthy();
    }
  });

  it("이름을 아는 나라는 문장까지 다 있다 — 가운데 칸을 빠뜨리면 여기서 걸린다", () => {
    // 나라 이름 → 나라 코드 → 언어 코드 → 문장, 세 표를 거친다. 나라만 넣고 언어를
    // 안 이으면 화면에서는 그냥 아무 말도 안 나와서, 넣은 사람이 눈치채지 못한다.
    for (const c of COVERED_COUNTRIES) {
      expect(toastFor(c), c).not.toBeNull();
    }
  });

  it("그 나라 말로 준다 — 영어로 때우지 않는다", () => {
    expect(toastFor("프랑스")?.text).toBe("Santé !");
    expect(toastFor("이탈리아")?.text).toBe("Cin cin!");
    expect(toastFor("독일")?.text).toBe("Prost!");
    expect(toastFor("그리스")?.text).toBe("Γεια μας!");
    expect(toastFor("조지아")?.text).toBe("გაუმარჯოს!");
    // 남아공은 영어도 공용어지만 와인 산지인 케이프는 아프리칸스 쪽이다.
    expect(toastFor("남아프리카공화국")?.text).toBe("Gesondheid!");
  });

  it("스페인어를 쓰는 나라는 같은 말을 받는다 — 나라마다 적어 두지 않는 이유", () => {
    const langs = ["스페인", "칠레", "아르헨티나", "멕시코", "우루과이"].map(
      (c) => toastFor(c)?.lang
    );
    expect(new Set(langs)).toEqual(new Set(["es"]));
  });

  it("러시아어는 На здоровье 가 아니다", () => {
    // 사전에서 cheers 를 찾으면 나오지만 러시아 사람은 건배로 안 쓴다 — 고맙다는
    // 인사에 답하는 말이고, 건배로 쓰는 건 미국 영화가 만든 오해다.
    const t = toastFor("러시아");
    expect(t?.text).not.toMatch(/^На здоровье/);
    expect(t?.text).toBe("За здоровье!");
  });

  it("오른쪽에서 왼쪽으로 쓰는 말은 그렇다고 알린다", () => {
    // 안 알리면 느낌표가 반대쪽에 붙는다.
    expect(toastFor("이스라엘")?.rtl).toBe(true);
    expect(toastFor("레바논")?.rtl).toBe(true);
    expect(toastFor("프랑스")?.rtl).toBe(false);
  });

  it("`lang` 을 단다 — 브라우저가 글자에 맞는 글꼴을 고르는 근거다", () => {
    expect(toastFor("일본")?.lang).toBe("ja");
    expect(toastFor("중국")?.lang).toBe("zh");
    expect(toastFor("헝가리")?.lang).toBe("hu");
  });

  it("읽을 수 없는 글자에는 나라 이름이 딸려 온다", () => {
    expect(toastFor("조지아")?.countryKo).toBe("조지아");
    expect(toastFor("남아공")?.countryKo).toBe("남아프리카공화국");
  });

  it("모르는 나라면 아무 말도 하지 않는다", () => {
    expect(toastFor("바누아투")).toBeNull();
    expect(toastFor(null)).toBeNull();
  });
});

describe("잘라낸 폰트가 지금 문구를 덮는가", () => {
  // 라틴이 아닌 글자는 시스템 폰트에 기댈 수 없다(윈도우는 문자별 폰트를 나중에 까는
  // 선택 기능으로 돌려놨다). 그래서 쓰는 글자만 잘라낸 woff2 를 레포에 넣어 둔다.
  // 문구를 고치고 `npx tsx scripts/build-toast-fonts.ts` 를 안 돌리면 새 글자만
  // 두부(□)가 되는데, 화면을 안 보면 아무도 모른다. 여기서 잡는다.
  const need = toastCharsByScript();

  it("빠진 글자가 없다 — 문구를 고쳤으면 폰트를 다시 만들어야 한다", () => {
    for (const [script, chars] of Object.entries(need)) {
      const have = (manifest as Record<string, { chars: string }>)[script]?.chars ?? "";
      const missing = [...chars].filter((c) => !have.includes(c));
      expect(missing, `${script}: ${missing.join("")} 가 빠졌다`).toEqual([]);
    }
  });

  it("문자 체계마다 쓸 폰트가 정해져 있다", () => {
    for (const script of Object.keys(need)) {
      expect(SCRIPT_FONTS[script], script).toBeTruthy();
    }
  });

  it("통째로 싣지 않는다 — 한 벌이 10KB 를 넘으면 잘라내기가 안 먹은 것이다", () => {
    for (const [script, m] of Object.entries(manifest as Record<string, { bytes: number }>)) {
      expect(m.bytes, `${script}: ${m.bytes}B`).toBeLessThan(10_000);
    }
  });
});
