import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clearFailedAttempts, recordFailedAttempt } from "./rate-limit";

// 단일 관리자(나)만 편집한다. 요청마다 x-admin-password 헤더로 비밀번호를 확인하고,
// 시도 폭주는 IP 기준 rate limit으로 막는다. 세션 쿠키는 두지 않는다(단순함 우선).
// 멀티유저로 넓힐 때가 오면 여기에 세션·소유자 검증을 얹는다(스키마의 owner 필드가 그 자리를 예약해 둠).

/** 상수 시간 비교. 길이·내용 차이로 인한 타이밍 노출을 줄인다. */
export function isPasswordValid(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export type AuthResult = { success: true } | { success: false; response: NextResponse };

/**
 * 편집 API 진입점에서 부른다. 성공이면 { success: true },
 * 실패면 그대로 돌려줄 응답이 담긴 { success: false, response }.
 */
export function verifyAdmin(request: NextRequest): AuthResult {
  // 로컬 개발(next dev)에서는 항상 편집 허용 — 배포는 NODE_ENV=production 이라 영향 없음.
  if (process.env.NODE_ENV === "development") {
    return { success: true };
  }
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { success: false, response: passwordNotConfiguredResponse() };
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return { success: false, response: rateLimitedResponse(rateLimit.retryAfterSeconds ?? 0) };
  }

  const password = request.headers.get("x-admin-password");
  if (!isPasswordValid(password, expected)) {
    recordFailedAttempt(ip);
    return { success: false, response: unauthorizedResponse(checkRateLimit(ip).remaining) };
  }

  clearFailedAttempts(ip);
  return { success: true };
}

export function passwordNotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    { error: "서버에 ADMIN_PASSWORD가 설정되어 있지 않습니다." },
    { status: 503 }
  );
}

export function unauthorizedResponse(remainingAttempts?: number): NextResponse {
  const message =
    remainingAttempts !== undefined
      ? `비밀번호가 올바르지 않습니다. 남은 시도 ${remainingAttempts}회.`
      : "비밀번호가 올바르지 않습니다.";
  return NextResponse.json({ error: message }, { status: 401 });
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return NextResponse.json(
    { error: `시도가 너무 많습니다. ${minutes}분 뒤에 다시 시도해 주세요.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
