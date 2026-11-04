import { launchChrome } from "../scripts/chrome.mjs";

/** 시험 전에 실제로 뜨는 브라우저 버전을 확인한다. 취약한 버전이면 시험 전체를 실패시킨다 */
export default async function globalSetup() {
  const browser = await launchChrome();
  const version = browser.version();
  await browser.close();
  console.log(`[e2e] 브라우저: Chrome ${version} (chrome)`);
}
