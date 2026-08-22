import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPasswordValid, verifyAdmin } from "./auth";
import { resetRateLimitStore } from "./rate-limit";

describe("isPasswordValid", () => {
  it("정확히 같으면 true", () => {
    expect(isPasswordValid("s3cret", "s3cret")).toBe(true);
  });

  it("다르면 false", () => {
    expect(isPasswordValid("wrong", "s3cret")).toBe(false);
  });

  it("길이가 달라도 false (예외 없이)", () => {
    expect(isPasswordValid("short", "muchlongerpassword")).toBe(false);
  });

  it("빈 값·미설정은 false", () => {
    expect(isPasswordValid(null, "s3cret")).toBe(false);
    expect(isPasswordValid("s3cret", undefined)).toBe(false);
    expect(isPasswordValid("", "")).toBe(false);
  });
});

describe("verifyAdmin", () => {
  const original = process.env.ADMIN_PASSWORD;
  beforeEach(() => resetRateLimitStore());
  afterEach(() => {
    process.env.ADMIN_PASSWORD = original;
  });

  const makeReq = (password?: string) =>
    new NextRequest("http://localhost/api/admin/verify", {
      method: "POST",
      headers: password ? { "x-admin-password": password } : {},
    });

  it("ADMIN_PASSWORD 미설정이면 503", () => {
    delete process.env.ADMIN_PASSWORD;
    const r = verifyAdmin(makeReq("x"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.response.status).toBe(503);
  });

  it("맞는 비밀번호면 성공", () => {
    process.env.ADMIN_PASSWORD = "s3cret";
    expect(verifyAdmin(makeReq("s3cret")).success).toBe(true);
  });

  it("틀린 비밀번호면 401", () => {
    process.env.ADMIN_PASSWORD = "s3cret";
    const r = verifyAdmin(makeReq("nope"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.response.status).toBe(401);
  });

  it("실패가 5번 쌓이면 429로 막는다", () => {
    process.env.ADMIN_PASSWORD = "s3cret";
    for (let i = 0; i < 5; i++) verifyAdmin(makeReq("nope"));
    const r = verifyAdmin(makeReq("nope"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.response.status).toBe(429);
  });
});
