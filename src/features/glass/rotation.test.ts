import { describe, expect, it } from "vitest";
import {
  isToastTurn,
  NAME_DELAY_S,
  NAME_LEAD_S,
  NAME_MOVE_MS,
  rotationOrder,
  TOAST_DELAY_S,
  TOAST_EVERY,
  TOAST_EXIT_S,
  TOAST_NAME_DELAY_S,
  WINE_HOLD_S,
} from "./rotation";

const MOVE_S = NAME_MOVE_MS / 1000;

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

describe("건배말이 끼어드는 차례", () => {
  it("첫 교체에는 안 뜬다 — 막 들어온 사람은 이름부터 봐야 한다", () => {
    expect(isToastTurn(0)).toBe(false);
  });

  it("정해진 간격마다 뜬다", () => {
    const turns = [];
    for (let i = 0; i < 12; i++) if (isToastTurn(i)) turns.push(i);
    expect(turns).toEqual([3, 7, 11]);
    expect(turns.every((i) => (i + 1) % TOAST_EVERY === 0)).toBe(true);
  });

  it("연달아 두 번 뜨지 않는다", () => {
    for (let i = 0; i < 40; i++) {
      expect(isToastTurn(i) && isToastTurn(i + 1)).toBe(false);
    }
  });

  it("아직 기본 잔일 때(i = -1)는 뜨지 않는다", () => {
    expect(isToastTurn(-1)).toBe(false);
  });
});

describe("건배말이 뜨는 회차의 시간표", () => {
  it("건배말이 다 빠진 뒤에 이름이 들어온다", () => {
    // 겹치면 한 자리에 글 두 줄이 동시에 보인다.
    expect(TOAST_NAME_DELAY_S).toBeGreaterThanOrEqual(TOAST_EXIT_S + MOVE_S);
  });

  it("읽을 시간이 있다 — 들어오자마자 나가지 않는다", () => {
    const readable = TOAST_EXIT_S - (TOAST_DELAY_S + MOVE_S);
    expect(readable).toBeGreaterThan(1);
  });

  it("그 회차만 이름이 늦다", () => {
    expect(TOAST_NAME_DELAY_S).toBeGreaterThan(NAME_DELAY_S);
  });

  it("건배말까지 다 끝나도 다음 교체까지 한참 남는다", () => {
    expect(WINE_HOLD_S).toBeGreaterThan((NAME_LEAD_S + TOAST_NAME_DELAY_S) * 10);
  });
});
