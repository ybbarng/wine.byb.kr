import { expect, test } from "@playwright/test";

// 회귀 방지: 홈·상세가 공유하는 와인잔(GlassStage 셸)의 캔버스가 포인터 입력을 받아야
// 스월(드래그·탭)이 동작한다. 셸 프레임 오버레이가 페이지 클릭을 막지 않도록 래퍼에
// pointer-events:none 을 주는데, 과거 그 때문에 안의 캔버스까지 입력이 막혀 스월이 죽었다.
// FluidLab 이 캔버스를 pointer-events:auto 로 되돌려 고쳤고, 아래가 항상 성립해야 한다.
test("shell 와인잔 캔버스는 포인터 입력을 받는다(스월이 막히지 않음)", async ({ page }) => {
  // 도감 → 와인 상세로 들어가 셸 잔을 띄운다(실제 사용 흐름).
  await page.goto("/catalog");
  const firstWine = page.locator('a[href^="/wine/"]').first();
  await firstWine.waitFor({ state: "visible" });
  const href = await firstWine.getAttribute("href");
  await firstWine.click();
  if (href) await page.waitForURL(`**${href}`);

  // 셸 잔 캔버스가 마운트될 때까지 대기(WebGPU 초기화 포함).
  const canvas = page.locator('[data-testid="glass-stage"] canvas').first();
  await canvas.waitFor({ state: "attached", timeout: 20_000 });

  // 1) 캔버스의 pointer-events 가 none 이면 스월이 죽는다 → auto 여야 한다.
  const pointerEvents = await canvas.evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pointerEvents, "잔 캔버스 pointer-events 가 none 이면 스월이 막힌다").not.toBe("none");

  // 2) 잔 중심의 hit target 이 실제 캔버스여야 한다(이벤트가 잔에 도달).
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const hitTag = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.tagName.toLowerCase() ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  );
  expect(hitTag, "잔 중심의 hit target 이 캔버스가 아니면 포인터 입력이 잔에 도달하지 않는다").toBe(
    "canvas"
  );
});
