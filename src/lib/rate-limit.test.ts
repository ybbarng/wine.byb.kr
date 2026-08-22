import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  clearFailedAttempts,
  recordFailedAttempt,
  resetRateLimitStore,
} from "./rate-limit";

describe("rate-limit", () => {
  beforeEach(() => resetRateLimitStore());

  it("기록이 없으면 허용하고 남은 횟수는 최대치", () => {
    const r = checkRateLimit("1.1.1.1");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(5);
  });

  it("실패를 5번 세면 막고 재시도 시간을 알려준다", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("2.2.2.2");
    const r = checkRateLimit("2.2.2.2");
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("실패마다 남은 횟수가 줄어든다", () => {
    recordFailedAttempt("3.3.3.3");
    expect(checkRateLimit("3.3.3.3").remaining).toBe(4);
    recordFailedAttempt("3.3.3.3");
    expect(checkRateLimit("3.3.3.3").remaining).toBe(3);
  });

  it("성공(clear)하면 카운트가 리셋된다", () => {
    recordFailedAttempt("4.4.4.4");
    recordFailedAttempt("4.4.4.4");
    clearFailedAttempts("4.4.4.4");
    expect(checkRateLimit("4.4.4.4").remaining).toBe(5);
  });

  it("성공은 예산을 깎지 않는다(확인만으로 카운트가 늘지 않음)", () => {
    checkRateLimit("5.5.5.5");
    checkRateLimit("5.5.5.5");
    expect(checkRateLimit("5.5.5.5").remaining).toBe(5);
  });

  it("창(15분)이 지나면 다시 허용한다", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) recordFailedAttempt("6.6.6.6");
      expect(checkRateLimit("6.6.6.6").allowed).toBe(false);
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      expect(checkRateLimit("6.6.6.6").allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("IP별로 따로 센다", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("7.7.7.7");
    expect(checkRateLimit("7.7.7.7").allowed).toBe(false);
    expect(checkRateLimit("8.8.8.8").allowed).toBe(true);
  });
});
