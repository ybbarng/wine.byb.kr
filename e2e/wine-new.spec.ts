import { expect, type Page, test } from "@playwright/test";

// 새 와인 등록 화면(/wine/new). 홈·상세의 와인잔 무대(GlassStage)가 이 폼을 덮으면
// 이름 칸과 "이름을 입력하세요" 안내가 가려져, 저장을 눌러도 반응이 없는 것처럼 보인다.
// 그래서 칸이 보이는지만이 아니라 "그 자리를 누르면 정말 그 칸이 눌리는지"까지 본다.
//
// 저장은 /api/wines 를 가짜 응답으로 막는다. 로컬 DB 에 시험용 와인을 쌓지 않기 위해서다.
// API 자체의 검증·저장은 src/app/api/routes.test.ts 가 맡는다.

/** 요소 한가운데를 눌렀을 때 맨 위에 있는 요소가 그 요소(또는 그 안)인지 */
async function isOnTop(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && (top === el || el.contains(top));
  });
}

const NAME_KO = 'input[name="nameKo"]';
const SUBMIT = 'button[type="submit"]';

for (const vp of [
  { name: "모바일", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: "데스크톱", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
]) {
  test.describe(`새 와인 등록 · ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch });

    test.beforeEach(async ({ page }) => {
      await page.goto("/wine/new");
      await expect(page.getByRole("heading", { name: "새 와인" })).toBeVisible();
    });

    test("와인잔 무대가 폼을 덮지 않는다", async ({ page }) => {
      await expect(page.getByTestId("glass-stage")).toHaveCount(0);
      for (const sel of [NAME_KO, 'input[name="nameLocal"]', SUBMIT]) {
        await page.locator(sel).scrollIntoViewIfNeeded();
        expect(await isOnTop(page, sel), `${sel} 위를 다른 요소가 덮고 있다`).toBe(true);
      }
    });

    test("이름을 비우고 저장하면 안내가 보이고 이름 칸으로 간다", async ({ page }) => {
      let posted = false;
      await page.route("**/api/wines", (route) => {
        posted = true;
        return route.abort();
      });
      await page.locator(SUBMIT).click();
      const err = page.getByText("이름을 입력하세요");
      await expect(err).toBeVisible();
      await expect(page.locator(NAME_KO)).toBeFocused();
      expect(await isOnTop(page, NAME_KO)).toBe(true);
      expect(posted).toBe(false);
    });

    test("이름을 넣고 저장하면 등록하고 기록 작성으로 넘어간다", async ({ page }) => {
      let body: Record<string, unknown> | null = null;
      await page.route("**/api/wines", async (route) => {
        body = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: { id: "e2e-wine-id", slug: "e2e" } });
      });

      if (vp.hasTouch) await page.locator(NAME_KO).tap();
      else await page.locator(NAME_KO).click();
      await page.keyboard.type("시험 와인");
      await page.locator('select[name="type"]').selectOption("white");
      await page.locator('input[name="abv"]').fill("12.5");

      if (vp.hasTouch) await page.locator(SUBMIT).tap();
      else await page.locator(SUBMIT).click();

      await page.waitForURL(/\/journal\/new\?wineId=e2e-wine-id/);
      expect(body).toEqual({ nameKo: "시험 와인", type: "white", abv: 12.5 });
    });

    test("서버가 실패하면 그 이유를 보여 준다", async ({ page }) => {
      await page.route("**/api/wines", (route) =>
        route.fulfill({ status: 500, json: { error: "저장소 오류" } })
      );
      await page.locator(NAME_KO).fill("시험 와인");
      await page.locator(SUBMIT).click();
      await expect(page.getByText("저장소 오류")).toBeVisible();
      await expect(page).toHaveURL(/\/wine\/new/);
    });
  });
}
