// 한국어 조사 — 앞말의 받침에 따라 갈리는 조사를 골라 붙인다.
//
// 품종·산지 이름을 문장에 끼워 넣는 안내 문구가 많은데, 이름이 데이터에서 오므로
// "까베르네 프랑가"처럼 조사가 틀어진다. 사람이 읽는 글이니 맞춰 쓴다.

/** 한글 음절의 받침 여부. 한글이 아니면(영문·숫자) null — 판단하지 않는다. */
function hasFinalConsonant(word: string): boolean | null {
  // 조합형(NFD)으로 들어오면 마지막 글자가 종성 자모라 음절 영역 밖이 된다. 미리
  // 완성형(NFC)으로 맞춘다 — 맥에서 붙여넣은 이름이 조합형인 경우가 있다.
  const last = word.normalize("NFC").trim().at(-1);
  if (!last) return null;
  const code = last.codePointAt(0);
  if (code == null) return null;
  // 한글 음절 영역(가~힣). 초성·중성·종성 조합이라 종성 유무를 계산할 수 있다.
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 앞말에 맞는 조사를 고른다. `withFinal` 은 받침이 있을 때(이/은/을/과),
 * `withoutFinal` 은 없을 때(가/는/를/와).
 *
 * 한글이 아니면(영문 이름 등) 받침을 알 수 없어 `withoutFinal` 로 둔다 —
 * 둘 중 하나는 골라야 하고, 영문은 "와/는/가"가 덜 어색하다.
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  return hasFinalConsonant(word) ? withFinal : withoutFinal;
}

/** 이름과 조사를 한 번에 붙인다. 자주 쓰는 네 쌍만 받는다. */
export function withJosa(word: string, pair: "이/가" | "은/는" | "을/를" | "과/와"): string {
  const [withFinal, withoutFinal] = pair.split("/");
  return `${word}${josa(word, withFinal, withoutFinal)}`;
}
