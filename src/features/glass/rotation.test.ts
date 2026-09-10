import { describe, expect, it } from "vitest";
import { NAME_DELAY_S, NAME_LEAD_S, rotationOrder, WINE_HOLD_S } from "./rotation";

const wines = ["a", "b", "c", "d", "e"].map((slug) => ({ slug }));

/** 결정적인 난수 — 테스트가 확률로 흔들리지 않게. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("rotationOrder", () => {
  it("한 바퀴에 모든 와인이 정확히 한 번씩 나온다", () => {
    // 매번 무작위로 뽑으면 어떤 와인은 연달아 나오고 어떤 와인은 아예 안 나온다.
    const order = rotationOrder(wines, seeded(7));
    expect(order.map((w) => w.slug).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("보던 와인을 맨 앞에 둔다 — 상세를 다녀와도 거기서 이어지게", () => {
    const order = rotationOrder(wines, seeded(7), "d");
    expect(order[0].slug).toBe("d");
    expect(order).toHaveLength(5);
    expect(new Set(order.map((w) => w.slug)).size).toBe(5); // 앞에 두느라 중복되지 않는다
  });

  it("보던 와인이 목록에 없으면 그냥 섞는다", () => {
    const order = rotationOrder(wines, seeded(3), "없는와인");
    expect(order.map((w) => w.slug).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("실제로 섞는다 — 순서를 그대로 두면 늘 같은 와인으로 시작한다", () => {
    const same = ["a", "b", "c", "d", "e"];
    const shuffled = rotationOrder(wines, seeded(11)).map((w) => w.slug);
    expect(shuffled).not.toEqual(same);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const src = [...wines];
    rotationOrder(src, seeded(5));
    expect(src.map((w) => w.slug)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("와인이 없거나 하나뿐이어도 터지지 않는다", () => {
    expect(rotationOrder([], seeded(1))).toEqual([]);
    expect(rotationOrder([{ slug: "a" }], seeded(1))).toHaveLength(1);
  });
});

describe("리듬", () => {
  it("이름이 잔보다 먼저 나가고 나중에 들어온다", () => {
    // 잔과 이름이 한 덩어리로 움직여 보이려면 이 순서여야 한다.
    expect(NAME_LEAD_S).toBeGreaterThan(0);
    expect(NAME_DELAY_S).toBeGreaterThan(0);
  });

  it("한 잔이 머무는 시간이 이름 전환보다 충분히 길다", () => {
    expect(WINE_HOLD_S).toBeGreaterThan((NAME_LEAD_S + NAME_DELAY_S) * 10);
  });
});
