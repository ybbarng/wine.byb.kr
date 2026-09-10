import { describe, expect, it } from "vitest";
import { ALL_PALETTE_AROMAS, AROMA_PALETTE } from "@/features/wine/aroma-palette";
import { GRAPE_ENTRIES } from "@/features/wine/curation/grape-info";
import { agingAromas, oakAromas } from "@/features/wine/tasting-hints";

/**
 * 예상으로 나올 수 있는 모든 향을 모은다 — 품종·숙성(레드/화이트 × 구간)·오크.
 * 팔레트가 이걸 다 담지 못하면, 사용자는 "예상됐지만 고를 수 없는 향"을 만난다.
 */
function everyExpectableAroma(): string[] {
  const all = new Set<string>();
  for (const [, info] of GRAPE_ENTRIES) {
    for (const a of info.aroma ?? []) all.add(a);
  }
  for (const type of ["red", "white"]) {
    for (const age of [6, 20]) {
      for (const a of agingAromas(age, type)) all.add(a);
    }
  }
  for (const oak of ["light", "heavy"]) {
    for (const a of oakAromas(oak)) all.add(a);
  }
  return [...all];
}

describe("AROMA_PALETTE — 어휘는 답보다 넓어야 한다", () => {
  it("예상으로 나올 수 있는 향을 모두 담는다", () => {
    // 하나라도 빠지면 그 향은 예상에만 뜨고 고를 수는 없는 상태가 된다.
    const missing = everyExpectableAroma().filter((a) => !ALL_PALETTE_AROMAS.includes(a));
    expect(missing, `팔레트에 없는 예상 향: ${missing.join(", ")}`).toEqual([]);
  });

  it("예상보다 넉넉하다 — 목록이 곧 답이 되지 않게", () => {
    // 팔레트가 예상 집합과 같으면 블라인드로 보여줄 이유가 없다.
    expect(ALL_PALETTE_AROMAS.length).toBeGreaterThan(everyExpectableAroma().length + 10);
  });

  it("같은 향이 두 묶음에 들어가지 않는다", () => {
    const seen = new Set<string>();
    const dup: string[] = [];
    for (const c of AROMA_PALETTE) {
      for (const a of c.aromas) {
        if (seen.has(a)) dup.push(a);
        seen.add(a);
      }
    }
    expect(dup, `중복: ${dup.join(", ")}`).toEqual([]);
  });

  it("묶음마다 이름·길잡이·향이 있다", () => {
    for (const c of AROMA_PALETTE) {
      expect(c.name.length, c.name).toBeGreaterThan(0);
      expect(c.hint.length, c.name).toBeGreaterThan(0);
      expect(c.aromas.length, c.name).toBeGreaterThan(0);
    }
  });
});
