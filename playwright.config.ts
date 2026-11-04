import { defineConfig, devices } from "@playwright/test";
import { BROWSER } from "./scripts/chrome.mjs";

// e2e 테스트 설정. 와인잔·지도 등 WebGPU/maplibre 인터랙션을 실제 브라우저에서 확인한다.
// WebGPU 는 headless 에서 불안정하므로 headed(플래그 포함)로 띄운다 — 로컬 실행용 가드.
// 이미 dev 서버(localhost:3000)가 떠 있으면 재사용하고, 없으면 새로 띄운다.
export default defineConfig({
  testDir: "./e2e",
  // 뜨는 브라우저가 보안 수정 뒤 버전인지 먼저 본다(scripts/chrome.mjs)
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-webgpu",
      use: {
        ...devices["Desktop Chrome"],
        // 번들 Chromium 대신 패치된 시스템 Chrome을 샌드박스를 켜서 띄운다
        channel: BROWSER.channel,
        headless: false,
        launchOptions: {
          chromiumSandbox: BROWSER.chromiumSandbox,
          args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle"],
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
