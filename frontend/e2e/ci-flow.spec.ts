import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, "../screenshots");

test.describe("CI/CD Intelligence E2E Flow", () => {
  test("complete lifecycle: generate dataset, score running run, finish it, verify on tracker, train weak model and see rejected, run sweep", async ({
    page,
  }) => {
    // 1. Navigate to runs page
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Runs" })).toBeVisible();

    // 2. Generate dataset
    const generateBtn = page.getByRole("button", { name: "Generate dataset" });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();
    await expect(generateBtn).not.toBeDisabled();
    await expect(page.locator("table tbody tr")).not.toHaveCount(0);

    // 3. Open a running run
    const runningTab = page.getByRole("button", { name: /Running/i });
    await runningTab.click();
    await expect(page).toHaveURL(/status=pending/);

    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible();
    const runLink = firstRow.locator("td a").first();
    const runHref = await runLink.getAttribute("href");
    expect(runHref).toMatch(/^\/runs\/\d+$/);
    const runId = runHref!.split("/").pop();
    await runLink.click();

    // 4. Verify run detail page
    await expect(page).toHaveURL(`/runs/${runId}`);
    await expect(page.getByRole("heading", { name: `Run ${runId}` })).toBeVisible();

    // 5. Score it
    const scoreBtn = page.getByRole("button", { name: "Score this run" });
    await expect(scoreBtn).toBeVisible();
    await scoreBtn.click();

    // Verify scored state
    await expect(scoreBtn).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Top signals" })).toBeVisible();
    await expect(page.getByLabel(/\d+% chance of failure/)).toBeVisible();
    await expect(page.getByText("Chance this run fails")).toBeVisible();

    // 6. Finish it
    const finishBtn = page.getByRole("button", { name: "Finish run" });
    await expect(finishBtn).toBeVisible();
    await finishBtn.click();

    // Verify finished state
    await expect(finishBtn).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Outcome" })).toBeVisible();
    await expect(page.getByText("Result", { exact: true })).toBeVisible();

    // 7. See it on the tracker
    await page.getByRole("link", { name: "Tracker" }).click();
    await expect(page).toHaveURL("/tracker");
    await expect(page.getByRole("heading", { name: "Prediction tracker" })).toBeVisible();
    await expect(page.locator(`table tbody a[href="/runs/${runId}"]`)).toBeVisible();
    await expect(page.getByText("Scored and finished")).toBeVisible();

    // 8. Train the weak model and see it rejected
    await page.getByRole("link", { name: "Models" }).click();
    await expect(page).toHaveURL("/models");
    await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();

    await page.getByLabel("Candidate").selectOption("weak_stump");
    const trainBtn = page.getByRole("button", { name: "Train and run gate" });
    await trainBtn.click();
    await expect(trainBtn).not.toBeDisabled();

    // Verify rejected status badge in registry
    const registry = page.locator("table").first();
    await expect(registry.locator("text=Rejected").first()).toBeVisible();

    // Verify promotion gate rejection reason
    await expect(page.getByText("The candidate was rejected.")).toBeVisible();

    // 9. Run the seed sweep and see the table
    const sweepBtn = page.getByRole("button", { name: "Run sweep" });
    await expect(sweepBtn).toBeVisible();
    await sweepBtn.click();
    await expect(sweepBtn).not.toBeDisabled();

    // Verify sweep table is visible with mean and spread metrics
    await expect(page.getByText("Test-set scores over multiple seeds")).toBeVisible();
    await expect(page.getByText("PR-AUC").first()).toBeVisible();
    await expect(page.getByText("Majority-class baseline").first()).toBeVisible();
    await expect(page.getByText("Logistic regression baseline").first()).toBeVisible();
    await expect(page.getByText("Generalisation: leave one scenario out").first()).toBeVisible();
    await expect(page.getByText(/Promotion gate passed on/i)).toBeVisible();
  });

  test("screenshot checks at 1280 and 375 pixels wide for Runs, Run detail, Models, and Tracker", async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const pages = [
      { name: "runs", path: "/", readySelector: "h1:has-text('Runs')" },
      { name: "run-detail", path: "/runs/1", readySelector: "h1:has-text('Run 1')" },
      { name: "models", path: "/models", readySelector: "h1:has-text('Models')" },
      { name: "tracker", path: "/tracker", readySelector: "h1:has-text('Prediction tracker')" },
    ];

    const viewports = [
      { width: 1280, height: 800, label: "1280" },
      { width: 375, height: 812, label: "375" },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const p of pages) {
        await page.goto(p.path);
        await page.waitForSelector(p.readySelector, { state: "visible" });
        // Wait briefly for charts, tables, and fonts to stabilize
        await page.waitForTimeout(300);

        const filename = `${p.name}-${vp.label}.png`;
        const filePath = path.join(SCREENSHOT_DIR, filename);

        await page.screenshot({ path: filePath, fullPage: true });

        if (vp.width === 375) {
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(scrollWidth).toBeLessThanOrEqual(375);
        }

        expect(fs.existsSync(filePath)).toBe(true);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(1000);
      }
    }
  });
});
