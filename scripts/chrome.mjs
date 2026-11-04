// 화면 시험·캡처 스크립트가 띄우는 브라우저(2026-11-04 보안 공지).
// Playwright 번들 Chromium(145~155)은 보안 취약점이 있어 받지 않는다. 패치된 시스템
// Chrome(`channel: "chrome"`)만 샌드박스를 켜서 띄운다. 실행이 실패해도 샌드박스를 끄거나
// 번들 Chromium으로 바꿔 띄우지 않는다.

export const BROWSER = /** @type {const} */ ({
  channel: "chrome",
  chromiumSandbox: true,
});

/** 취약점이 고쳐진 가장 낮은 Chrome 버전. 이보다 낮으면 페이지를 열지 않는다 */
export const MIN_CHROME = "156.0.8078.73";

/**
 * 점으로 나눈 버전 비교: a가 b보다 낮으면 음수
 * @param {string} a
 * @param {string} b
 */
export function compareVersion(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 띄운 브라우저가 보안 수정 전 버전이면 닫고 오류를 낸다
 * @param {import("playwright").Browser} browser
 */
export async function assertPatchedChrome(browser) {
  const version = browser.version();
  if (compareVersion(version, MIN_CHROME) < 0) {
    await browser.close();
    throw new Error(
      `Chrome ${version}은 보안 수정 전 버전이다. ${MIN_CHROME} 이상으로 올려야 한다`
    );
  }
  return version;
}

/**
 * 시스템 Chrome을 샌드박스를 켜서 띄우고, 페이지를 열기 전에 버전 하한을 확인한다
 * @param {Omit<import("playwright").LaunchOptions, "channel" | "chromiumSandbox">} [options]
 */
export async function launchChrome(options = {}) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ ...options, ...BROWSER });
  await assertPatchedChrome(browser);
  return browser;
}
