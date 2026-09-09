import { describe, expect, it } from "vitest";
import { josa, withJosa } from "./korean";

describe("josa — 받침에 따라 조사를 고른다", () => {
  it("받침이 있으면 이/은/을/과", () => {
    // 실제로 틀어졌던 이름들 — 품종 이름이 데이터에서 온다.
    expect(withJosa("까베르네 프랑", "이/가")).toBe("까베르네 프랑이");
    expect(withJosa("리즐링", "은/는")).toBe("리즐링은");
    expect(withJosa("쁘띠 베르도", "이/가")).toBe("쁘띠 베르도가"); // 도=받침 없음
  });

  it("받침이 없으면 가/는/를/와", () => {
    expect(withJosa("메를로", "이/가")).toBe("메를로가");
    expect(withJosa("푸르민트", "은/는")).toBe("푸르민트는");
    expect(withJosa("산지오베제", "과/와")).toBe("산지오베제와");
  });

  it("한글이 아니면 받침 없는 쪽으로 둔다", () => {
    // 영문 이름에 "이/은/과"를 붙이면 더 어색하다.
    expect(withJosa("Merlot", "이/가")).toBe("Merlot가");
    expect(josa("", "이", "가")).toBe("가");
  });

  it("끝 공백이 있어도 마지막 글자로 판단한다", () => {
    expect(josa("리즐링 ", "은", "는")).toBe("은");
    expect(josa("메를로 ", "은", "는")).toBe("는");
  });
});
