import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANVAS_TONEMAPPED } from "./canvas-bg";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("캔버스 배경과 페이지 배경", () => {
  it("--background 가 캔버스 톤매핑 결과와 같다", () => {
    // 어긋나면 캔버스 둘레에 색이 살짝 다른 사각형이 생긴다. 옅은 차이라 눈으로는
    // 한참 못 알아채므로 여기서 잡는다. 토큰을 바꿨다면 CANVAS_BG 도 다시 잡아야 한다.
    const m = css.match(/--background:\s*(#[0-9a-f]{6})/i);
    expect(m?.[1]?.toLowerCase()).toBe(CANVAS_TONEMAPPED);
  });
});
