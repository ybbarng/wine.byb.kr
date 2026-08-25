import { describe, expect, it } from "vitest";
import { decodeSlug } from "./slug";

// NFC "메를로" — DB에 저장된 형태(실제 품종 slug).
const MERLOT = String.fromCodePoint(0xba54, 0xb97c, 0xb85c);

describe("decodeSlug", () => {
  it("percent-encoded non-ASCII slug를 디코딩한다", () => {
    // 이 Next 버전이 넘기는 형태: 디코딩 안 된 채로.
    expect(decodeSlug("%EB%A9%94%EB%A5%BC%EB%A1%9C")).toBe(MERLOT);
    expect(decodeSlug(encodeURIComponent(MERLOT))).toBe(MERLOT);
  });

  it("이미 디코딩된 ASCII slug는 그대로 둔다(no-op)", () => {
    expect(decodeSlug("negroamaro")).toBe("negroamaro");
    expect(decodeSlug("bordeaux-saint-julien")).toBe("bordeaux-saint-julien");
    expect(decodeSlug("말벡-malbec".normalize("NFC"))).toBe("말벡-malbec".normalize("NFC"));
  });

  it("NFD로 들어와도 DB(NFC)와 맞도록 NFC로 정규화한다", () => {
    const nfd = MERLOT.normalize("NFD");
    expect(nfd).not.toBe(MERLOT); // 전제: NFD ≠ NFC
    expect(decodeSlug(nfd)).toBe(MERLOT);
  });

  it("잘못된 % 이스케이프는 던지지 않고 원본을 쓴다", () => {
    // 100% 같은 값이 와도 안전.
    expect(decodeSlug("100%")).toBe("100%");
    expect(decodeSlug("a%zz")).toBe("a%zz");
  });
});
