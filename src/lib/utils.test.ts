import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("여러 클래스를 공백으로 합친다", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("거짓 값은 건너뛴다", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("Tailwind 충돌은 뒤 값이 이긴다", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
