// 아주 단순한 메모리 기반 rate limit. 로그인 시도 폭주를 막는 용도.
// 서버가 재시작되면 초기화된다(단일 인스턴스라 충분).

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptRecord>();

const MAX_ATTEMPTS = 5; // 창(window)당 최대 시도
const WINDOW_MS = 15 * 60 * 1000; // 15분

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

/**
 * 이 IP가 지금 시도해도 되는지만 확인한다(카운트는 올리지 않는다).
 * 실패를 셀 때는 recordFailedAttempt를, 성공하면 clearFailedAttempts를 부른다.
 * 이렇게 하면 실패만 제한에 반영되고 성공은 예산을 깎지 않는다.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now > record.resetAt) {
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  if (record.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - record.count };
}

/** 실패를 한 건 더 기록한다. */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count++;
  }
}

/** 성공했으면 이 IP의 실패 기록을 지운다. */
export function clearFailedAttempts(ip: string): void {
  attempts.delete(ip);
}

/** 테스트에서 상태를 비우기 위한 헬퍼. */
export function resetRateLimitStore(): void {
  attempts.clear();
}
