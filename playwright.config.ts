import { defineConfig, devices } from "@playwright/test";

// e2e 테스트 설정. 와인잔·지도 등 WebGPU/maplibre 인터랙션을 실제 브라우저에서 확인한다.
// WebGPU 는 headless 에서 불안정하므로 headed(플래그 포함)로 띄운다 — 로컬 실행용 가드.
// 이미 dev 서버(localhost:3000)가 떠 있으면 재사용하고, 없으면 새로 띄운다.
export default defineConfig({
  testDir: "./e2e",
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
        headless: false,
        launchOptions: {
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
